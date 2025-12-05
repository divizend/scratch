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

const port = process.env.PORT || 3000;
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
