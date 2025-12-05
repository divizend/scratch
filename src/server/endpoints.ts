import { Hono } from "hono";
import { registerScratchEndpoints, ScratchEndpointDefinition } from "./scratch";
import {
  coreEndpoints,
  setUniverse as setCoreUniverse,
} from "./endpoints/core";
import { emailQueueEndpoints } from "./endpoints/emailQueue";

// Re-export setUniverse for convenience
export function setUniverse(u: any) {
  setCoreUniverse(u);
}

// Register all Scratch endpoints
export async function registerEndpoints(app: Hono) {
  const endpoints: ScratchEndpointDefinition[] = [
    ...coreEndpoints,
    ...emailQueueEndpoints,
  ];

  await registerScratchEndpoints(app, endpoints);
}
