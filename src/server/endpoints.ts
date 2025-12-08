import { Hono } from "hono";
import { registerScratchEndpoints, ScratchEndpointDefinition } from "./scratch";
import { coreEndpoints } from "./endpoints/core";
import { emailQueueEndpoints } from "./endpoints/emailQueue";
import { gsuiteEndpoints } from "./endpoints/gsuite";
import { streamstoreEndpoints } from "./endpoints/streamstore";
import { systemEndpoints } from "./endpoints/system";
import { setUniverse } from "./universe";

// Re-export setUniverse for convenience
export { setUniverse };

// Store the endpoints array for reuse
let allEndpoints: ScratchEndpointDefinition[] = [];

// Get all registered endpoint definitions
export function getAllEndpointDefinitions(): ScratchEndpointDefinition[] {
  return [...allEndpoints];
}

// Register all Scratch endpoints
export async function registerEndpoints(app: Hono) {
  allEndpoints = [
    ...systemEndpoints,
    ...coreEndpoints,
    ...emailQueueEndpoints,
    ...gsuiteEndpoints,
    ...streamstoreEndpoints,
  ];

  await registerScratchEndpoints(app, allEndpoints);

  // Register stream viewer as catch-all route (must be last)
  // This handles any path that doesn't match other endpoints
  let streamViewer: ScratchEndpointDefinition | undefined;
  for (const ep of systemEndpoints) {
    const blockDef = await ep.block({});
    if (blockDef.opcode === "streamViewer") {
      streamViewer = ep;
      break;
    }
  }

  if (streamViewer) {
    // Build set of registered endpoint paths for quick lookup
    const registeredPaths = new Set<string>(["/", "/admin", "/extension"]);
    for (const ep of allEndpoints) {
      const blockDef = await ep.block({});
      registeredPaths.add(`/${blockDef.opcode}`);
    }

    app.get("*", async (c, next) => {
      // Skip if path matches other registered endpoints or reserved paths
      const path = c.req.path;
      if (registeredPaths.has(path)) {
        return next();
      }

      // This is a stream viewer path
      const context = {
        c,
        query: c.req.query(),
        userEmail: undefined,
        universe: undefined,
      };
      const result = await streamViewer!.handler(context as any);
      if (result instanceof Response) {
        return result;
      }
      if (typeof result === "string") {
        return c.html(result);
      }
      return c.json(result);
    });
  }
}
