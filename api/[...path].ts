/**
 * Vercel Serverless Function Entry Point
 * 
 * This catch-all route handler uses the Universe's fetch handler
 * to process all incoming requests without requiring Hono.
 */

import { Universe } from "../src";
import { setUniverse } from "../src/core";
import { resolve, join } from "node:path";
import { cwd } from "node:process";

// Initialize Universe (singleton pattern for serverless)
let universe: Universe | null = null;
let fetchHandler: ((request: Request) => Promise<Response>) | null = null;

async function initializeUniverse() {
  if (universe && fetchHandler) {
    return fetchHandler;
  }

  // Get endpoints directory
  const endpointsDir = resolve(join(cwd(), "endpoints"));

  // Initialize Universe
  universe = await Universe.construct({
    endpointsDirectory: endpointsDir,
  });
  setUniverse(universe);

  // Get fetch handler
  fetchHandler = universe.httpServer.getFetchHandler();

  return fetchHandler;
}

export default async function handler(request: Request): Promise<Response> {
  const handler = await initializeUniverse();
  return handler(request);
}

