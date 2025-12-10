/**
 * Server Entry Point
 *
 * This file exports the Universe's HTTP server for Bun to use.
 * The Universe is automatically initialized and the server is started
 * when this module is imported.
 */

import { Universe } from "./src";
import { setUniverse } from "./src/core";
import { envOrDefault } from "./src/core/Env";

// Initialize Universe (this will start the HTTP server automatically)
const universe = await Universe.construct({ gsuite: true });
setUniverse(universe);

// Get port and fetch handler for Bun
const port = parseInt(envOrDefault(undefined, "PORT", "3000"), 10);
const fetchHandler = universe.httpServer.getFetchHandler();

export default {
  port,
  fetch: fetchHandler,
};
