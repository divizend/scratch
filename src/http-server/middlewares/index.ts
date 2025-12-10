/**
 * Middleware exports
 */

export * from "./types";
export * from "./01-cors";
export * from "./02-static";
export * from "./03-request-logger";
export * from "./04-body-parser";
export * from "./05-no-cache";
export * from "./06-response-handler";
export * from "./handler-wrapper";

import { Middleware } from "./types";
import { corsMiddleware } from "./01-cors";
import { createStaticMiddleware } from "./02-static";
import { requestLoggerMiddleware } from "./03-request-logger";
import { bodyParserMiddleware } from "./04-body-parser";
import { noCacheMiddleware } from "./05-no-cache";

/**
 * Creates the middleware chain for NativeHttpServer
 * @param staticRootPath - Root path for static files (or null)
 * @returns Array of middlewares in execution order
 */
export function createMiddlewareChain(
  staticRootPath: string | null
): Middleware[] {
  return [
    corsMiddleware,
    createStaticMiddleware({ rootPath: staticRootPath }),
    requestLoggerMiddleware,
    bodyParserMiddleware,
    noCacheMiddleware,
  ];
}

