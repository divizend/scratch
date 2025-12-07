import { Hono } from "hono";
import { registerScratchEndpoints, ScratchEndpointDefinition } from "./scratch";
import { coreEndpoints } from "./endpoints/core";
import { emailQueueEndpoints } from "./endpoints/emailQueue";
import { gsuiteEndpoints } from "./endpoints/gsuite";
import { streamstoreEndpoints } from "./endpoints/streamstore";
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
    ...coreEndpoints,
    ...emailQueueEndpoints,
    ...gsuiteEndpoints,
    ...streamstoreEndpoints,
  ];

  await registerScratchEndpoints(app, allEndpoints);
}
