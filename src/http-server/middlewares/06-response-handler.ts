/**
 * Response Handler Middleware
 * Handles converting handler responses to HTTP responses
 */

import { Middleware, MiddlewareContext } from "./types";

export const responseHandlerMiddleware: Middleware = async (ctx, next) => {
  const { req, res, context } = ctx;

  // This middleware runs after routing, so if we get here,
  // the route handler should have already set the response
  // But we can add response formatting here if needed
  await next();
};

/**
 * Converts a handler result to an HTTP response
 */
export function handleHandlerResult(result: any, res: any): void {
  if (result instanceof Response) {
    // Copy Response to Node response
    res.writeHead(result.status, Object.fromEntries(result.headers));
    result.text().then((body) => res.end(body));
    return;
  }
  if (typeof result === "string") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(result);
    return;
  }
  if (result === null || result === undefined) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}
