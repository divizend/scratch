import { Hono } from "hono";
import { registerScratchEndpoints, ScratchEndpointDefinition } from "./scratch";
import { coreEndpoints } from "./endpoints/core";
import { emailQueueEndpoints } from "./endpoints/emailQueue";
import { setUniverse } from "./universe";

// Re-export setUniverse for convenience
export { setUniverse };

// Register all Scratch endpoints
export async function registerEndpoints(app: Hono) {
  const endpoints: ScratchEndpointDefinition[] = [
    ...coreEndpoints,
    ...emailQueueEndpoints,
  ];

  await registerScratchEndpoints(app, endpoints);
}
