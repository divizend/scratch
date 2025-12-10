/**
 * Vercel Serverless Function - Catch-all Route Handler
 *
 * This handles all routes by using the Universe's fetch handler.
 * The fetch handler from NativeHttpServer processes all requests.
 */

import { Universe } from "../src";
import { setUniverse } from "../src/core";
import { resolve, join } from "node:path";
import { cwd } from "node:process";

// Initialize Universe as a singleton (cached across invocations in Vercel's serverless environment)
let universe: Universe | null = null;
let fetchHandler: ((request: Request) => Promise<Response>) | null = null;

async function getHandler(): Promise<(request: Request) => Promise<Response>> {
  // Return cached handler if already initialized (Vercel caches modules between invocations)
  if (fetchHandler) {
    return fetchHandler;
  }

  // Get endpoints directory
  const endpointsDir = resolve(join(cwd(), "endpoints"));

  // Initialize Universe (this won't start an HTTP server in Vercel/Bun environment)
  universe = await Universe.construct({
    endpointsDirectory: endpointsDir,
  });
  setUniverse(universe);

  // Get the fetch handler from NativeHttpServer
  // This is what Vercel needs - it converts Fetch API requests to our internal format
  fetchHandler = universe.httpServer.getFetchHandler();

  return fetchHandler;
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
    const host = request.headers.get("host") || request.headers.get("Host") || "localhost";
    const protocol = request.headers.get("x-forwarded-proto") || 
                    (host.includes("localhost") ? "http" : "https");
    requestUrl = `${protocol}://${host}${requestUrl.startsWith("/") ? requestUrl : "/" + requestUrl}`;
    
    // Create a new Request with the absolute URL
    request = new Request(requestUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
  }
  
  return handler(request);
}
