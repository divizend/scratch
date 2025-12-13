/**
 * No-Cache Middleware
 * Sets no-cache headers for all responses
 */

import { Middleware, MiddlewareContext } from "./types";

export const noCacheMiddleware: Middleware = async (ctx, next) => {
  const { res } = ctx;

  setNoCacheHeaders(res);
  await next();
};

function setNoCacheHeaders(res: any): void {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

