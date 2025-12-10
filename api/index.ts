/**
 * Vercel Server Entry Point
 *
 * This exports the server's fetch handler for Vercel to use.
 * All routes are handled by the single server instance.
 */

import server from "../server";

// Extract the fetch handler from the server export
// server.default is { port, fetch }, so we use the fetch property
export default server.fetch;
