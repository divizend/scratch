/**
 * Vercel Serverless Function - Catch-all Route Handler
 *
 * This handles all routes by using the Universe's fetch handler.
 * The fetch handler from NativeHttpServer processes all requests.
 */

import { Universe, setUniverse, getProjectRoot } from "@divizend/scratch-core";
import { resolve, join } from "node:path";

// Initialize Universe as a singleton (cached across invocations in Vercel's serverless environment)
let universe: Universe | null = null;
let fetchHandler: ((request: Request) => Promise<Response>) | null = null;

async function getHandler(): Promise<(request: Request) => Promise<Response>> {
  // Return cached handler if already initialized (Vercel caches modules between invocations)
  if (fetchHandler) {
    return fetchHandler;
  }

  const projectRoot = await getProjectRoot();
  const endpointsDir = resolve(join(projectRoot, "endpoints"));
  const { envOrDefault } = await import("@divizend/scratch-core");
  const hostType = envOrDefault(undefined, "HOST_TYPE", "local");
  const githubUrl = process.env.ENDPOINTS_GITHUB_URL;

  const initLog = (record: Record<string, unknown>) => {
    if (!record.ts) record.ts = new Date().toISOString();
    console.log(JSON.stringify(record));
  };

  initLog({
    level: "info",
    event: "initializing_universe",
    projectRoot,
    endpointsDir,
    hostType,
    githubUrl: githubUrl || undefined,
  });

  // Initialize Universe (this won't start an HTTP server in Vercel/Bun environment)
  // Pass endpointsDir even on server - loadEndpointsFromDirectory will detect server and use GitHub
  universe = await Universe.construct({
    endpointsDirectory: endpointsDir,
  });
  setUniverse(universe);

  const endpointCount = universe.httpServer.getAllEndpoints().length;
  initLog({ level: "info", event: "universe_initialized", endpointCount });

  // Get the fetch handler from NativeHttpServer
  // This is what Vercel needs - it converts Fetch API requests to our internal format
  fetchHandler = universe.httpServer.getFetchHandler();

  return fetchHandler;
}

/**
 * Helper to get header value from either Headers object or plain object
 */
function getHeader(headers: any, name: string): string | null {
  if (headers && typeof headers.get === "function") {
    return headers.get(name) || headers.get(name.toLowerCase());
  }
  if (headers && typeof headers === "object") {
    return headers[name] || headers[name.toLowerCase()] || null;
  }
  return null;
}

/**
 * Vercel serverless function handler
 *
 * Vercel will call this function for all routes (due to [...path] catch-all).
 * We need to ensure the request URL is absolute before passing it to the fetch handler.
 */
export default async function handler(request: Request): Promise<Response> {
  const handler = await getHandler();

  // Ensure request URL is absolute (Vercel may pass relative URLs)
  let requestUrl = request.url;
  if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
    // Construct absolute URL from request headers
    const host =
      getHeader(request.headers, "host") ||
      getHeader(request.headers, "Host") ||
      "localhost";
    const protocol =
      getHeader(request.headers, "x-forwarded-proto") ||
      (host.includes("localhost") ? "http" : "https");
    requestUrl = `${protocol}://${host}${
      requestUrl.startsWith("/") ? requestUrl : "/" + requestUrl
    }`;

    // Create a new Request with the absolute URL
    request = new Request(requestUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
  }

  return handler(request);
}
