import { Hono } from "hono";
import { cors } from "hono/cors";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Universe } from "./src";
import {
  registerEndpoints,
  setUniverse,
  registerExtensionEndpoint,
  registerStaticRoutes,
  getRegisteredEndpoints,
} from "./src/server";
import { renderStreamViewer } from "./src/server/streamViewer";
import { envOrDefault, env } from "./src/core/Env";
import { getUniverse } from "./src/server/universe";
import { S2 } from "./src/s2";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = __dirname;

const app = new Hono();

// Initialize Universe instance on startup
let universe: Universe | null = null;
(async () => {
  try {
    universe = await Universe.construct({ gsuite: true });
    setUniverse(universe);
    console.log("Universe initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Universe:", error);
  }
})();

// CORS middleware - allow all origins, methods, and headers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  })
);

// Middleware to log all HTTP requests to S2 stream
app.use("*", async (c, next) => {
  // Capture request information before processing
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const query = c.req.query();
  const headers: Record<string, string> = {};

  // Collect all headers
  const headerObj = c.req.header();
  if (headerObj) {
    for (const [key, value] of Object.entries(headerObj)) {
      headers[key] = String(value);
    }
  }

  // Try to read body (non-blocking, don't await)
  let body: any = null;
  try {
    // Only try to read body for methods that typically have bodies
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await c.req.json().catch(() => null);
      } else if (
        contentType.includes("text/") ||
        contentType.includes("application/")
      ) {
        body = await c.req.text().catch(() => null);
      }
    }
  } catch (error) {
    // Ignore body reading errors
  }

  // Process the request
  await next();

  // Capture response information
  const duration = Date.now() - startTime;
  const status = c.res.status;

  // Log to S2 stream asynchronously (fire and forget)
  (async () => {
    try {
      const universe = getUniverse();
      if (!universe || !universe.s2) {
        return; // S2 not available, skip logging
      }

      const hostedAt = env("HOSTED_AT", { required: false });
      if (!hostedAt) {
        return; // HOSTED_AT not set, skip logging
      }

      const streamName = `${hostedAt}/http/incoming`;
      const basinName = S2.getBasin();

      const requestData = {
        method,
        path,
        query: Object.keys(query).length > 0 ? query : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body !== null ? body : undefined,
        status,
        duration,
        timestamp: new Date().toISOString(),
      };

      await universe.s2.appendToStream(basinName, streamName, requestData);
    } catch (error) {
      // Silently ignore logging errors to not affect request processing
      console.error("Failed to log request to S2 stream:", error);
    }
  })();
});

// Middleware to set no-cache headers
app.use("*", async (c, next) => {
  await next();
  // Set no-cache headers for all responses
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

// Register static routes (README, admin interface)
registerStaticRoutes(app, projectRoot);

// Register stream viewer routes (e.g., /scratch-demo or /interpreter/inbox)
// Use catch-all route to handle multi-segment stream names
app.get("*", async (c, next) => {
  const path = c.req.path;

  // Skip reserved routes - let them be handled by other handlers
  if (
    path.startsWith("/admin") ||
    path.startsWith("/api") ||
    path.startsWith("/extension") ||
    path === "/"
  ) {
    return next();
  }

  // Extract stream name from path (remove leading slash)
  // This handles both single-segment (e.g., "scratch-demo") and multi-segment (e.g., "interpreter/inbox") stream names
  const streamName = path.substring(1);

  // Serve the stream viewer HTML page
  return c.html(renderStreamViewer(streamName));
});

// Register all Scratch endpoints and log them
(async () => {
  // Register all Scratch endpoints
  await registerEndpoints(app);

  // Register extension source endpoint
  registerExtensionEndpoint(app);

  // Log all registered endpoints
  const endpoints = getRegisteredEndpoints();
  console.log("\n📋 Registered Scratch Endpoints:");
  console.log("=".repeat(50));
  await Promise.all(
    endpoints.map(async (ep) => {
      // Call block function with empty context to get block definition (await since it returns a Promise)
      const blockDef = await ep.block({});
      const method = blockDef.blockType === "reporter" ? "GET" : "POST";
      const auth = ep.noAuth ? " (no auth)" : "";
      console.log(
        `  ${method.padEnd(4)} ${ep.endpoint.padEnd(30)} ${
          blockDef.blockType
        }${auth}`
      );
    })
  );
  console.log("=".repeat(50));
  console.log(`Total: ${endpoints.length} endpoints\n`);
})();

const port = parseInt(envOrDefault(undefined, "PORT", "3000"), 10);
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
