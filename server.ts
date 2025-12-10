import { Hono } from "hono";
import { cors } from "hono/cors";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Universe } from "./src";
import {
  registerEndpoints,
  registerStaticRoutes,
} from "./src/server";
import { getRegisteredEndpoints } from "./src/server/endpoints";
import { envOrDefault, env } from "./src/core/Env";
import { getUniverse, setUniverse } from "./src/core";
import { S2 } from "./src/s2";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = __dirname;

const app = new Hono();

// Register static routes FIRST (before any middleware that might trigger router building)
registerStaticRoutes(app, projectRoot);

let isInitialized = false;
const initPromise = initialize();

// Initialize Universe and register endpoints
async function initialize() {
  try {
    // Initialize Universe first
    const universe = await Universe.construct({ gsuite: true });
    setUniverse(universe);
    console.log("Universe initialized successfully");

    // Register all Scratch endpoints
    await registerEndpoints(app);

    // Log all registered endpoints
    const endpoints = getRegisteredEndpoints();
    console.log("\n📋 Registered Scratch Endpoints:");
    console.log("=".repeat(50));
    const endpointInfos = await Promise.all(
      endpoints.map(async (ep) => {
        const blockDef = await ep.block({});
        const method = blockDef.blockType === "reporter" ? "GET" : "POST";
        const auth = ep.noAuth ? " (no auth)" : "";
        return { method, endpoint: ep.endpoint, blockType: blockDef.blockType, auth, text: blockDef.text };
      })
    );
    // Sort alphabetically by text
    endpointInfos.sort((a, b) => a.text.localeCompare(b.text));
    endpointInfos.forEach((info) => {
      console.log(
        `  ${info.method.padEnd(4)} ${info.endpoint.padEnd(30)} ${info.blockType}${info.auth}`
      );
    });
    console.log("=".repeat(50));
    console.log(`Total: ${endpoints.length} endpoints\n`);

    isInitialized = true;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    throw error;
  }
}

// CORS middleware
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  })
);

// Middleware to ensure initialization is complete
app.use("*", async (c, next) => {
  if (!isInitialized) {
    await initPromise;
  }
  await next();
});

// Middleware to log all HTTP requests to S2 stream
app.use("*", async (c, next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const query = c.req.query();
  const headers: Record<string, string> = {};

  const headerObj = c.req.header();
  if (headerObj) {
    for (const [key, value] of Object.entries(headerObj)) {
      headers[key] = String(value);
    }
  }

  let body: any = null;
  try {
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

  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;

  // Log to S2 stream asynchronously
  (async () => {
    try {
      const universe = getUniverse();
      if (!universe?.s2) return;

      const hostedAt = env("HOSTED_AT", { required: false });
      if (!hostedAt) return;

      const streamName = `${hostedAt}/http/incoming`;
      const basinName = S2.getBasin();

      await universe.s2.appendToStream(basinName, streamName, {
        method,
        path,
        query: Object.keys(query).length > 0 ? query : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body !== null ? body : undefined,
        status,
        duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log request to S2 stream:", error);
    }
  })();
});

// Middleware to set no-cache headers
app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

const port = parseInt(envOrDefault(undefined, "PORT", "3000"), 10);
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
