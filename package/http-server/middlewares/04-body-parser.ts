/**
 * Body Parser Middleware
 * Parses request body for POST/PUT/PATCH requests
 */

import { Middleware, MiddlewareContext } from "./types";

async function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // If body is already parsed (from fetch handler), use it
    if ((req as any).body !== undefined) {
      resolve((req as any).body);
      return;
    }

    let body = "";
    req.on("data", (chunk: any) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const contentType = req.headers?.["content-type"] || "";
        if (contentType.includes("application/json")) {
          resolve(body ? JSON.parse(body) : {});
        } else {
          resolve(body || {});
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export const bodyParserMiddleware: Middleware = async (ctx, next) => {
  const { req, context } = ctx;
  const method = req.method || "GET";

  // Read body once if needed (for POST/PUT/PATCH)
  if (["POST", "PUT", "PATCH"].includes(method)) {
    try {
      const requestBody = await readBody(req);
      // Store body in request object for later use
      (req as any).body = requestBody;
      context.requestBody = requestBody;
    } catch {
      // Ignore body reading errors
    }
  }

  await next();
};

