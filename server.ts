/**
 * Server Entry Point
 *
 * This file exports the Universe's HTTP server for Bun to use.
 * The Universe is automatically initialized and the server is started
 * when this module is imported.
 */

import { resolve, join } from "node:path";

console.log("[server.ts] Starting server.ts");
console.log("[server.ts] import.meta.url:", import.meta.url);

console.log("[server.ts] Attempting to import from @divizend/scratch-core");
console.log("[server.ts] Resolving @divizend/scratch-core...");
try {
  const resolved = await import.meta.resolve("@divizend/scratch-core");
  console.log("[server.ts] Resolved path:", resolved);
} catch (e) {
  console.error("[server.ts] Error resolving:", e);
}
const scratchCore = await import("@divizend/scratch-core");
console.log("[server.ts] @divizend/scratch-core module keys:", Object.keys(scratchCore));
console.log("[server.ts] Universe exists:", "Universe" in scratchCore);
console.log("[server.ts] setUniverse exists:", "setUniverse" in scratchCore);
console.log("[server.ts] envOrDefault exists:", "envOrDefault" in scratchCore);
console.log("[server.ts] getProjectRoot exists:", "getProjectRoot" in scratchCore);
console.log("[server.ts] S2 exists:", "S2" in scratchCore);

const { Universe, setUniverse, envOrDefault, getProjectRoot } = scratchCore;

// Get endpoints directory (defaults to ./endpoints)
const projectRoot = await getProjectRoot();
const endpointsDir = resolve(join(projectRoot, "endpoints"));

// Initialize Universe (this will start the HTTP server automatically)
// GSuite is enabled by default, so we don't need to specify it
const universe = await Universe.construct({
  endpointsDirectory: endpointsDir,
});
setUniverse(universe);

// Get port and fetch handler for Bun
const port = parseInt(envOrDefault(undefined, "PORT", "3000"), 10);
const fetchHandler = universe.httpServer.getFetchHandler();

export default {
  port,
  fetch: fetchHandler,
};
