/**
 * CORS Middleware
 * Handles CORS preflight requests and sets CORS headers
 */

import { Middleware, MiddlewareContext } from "./types";

export const corsMiddleware: Middleware = async (ctx, next) => {
  const { req, res } = ctx;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }

  // Set CORS headers for all responses
  setCorsHeaders(res);
  await next();
};

function setCorsHeaders(res: any): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "*");
}

