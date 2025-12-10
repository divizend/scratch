/**
 * Static File Middleware
 * Serves static files from the configured root directory
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Middleware, MiddlewareContext } from "./types";

export interface StaticMiddlewareOptions {
  rootPath: string | null;
}

export function createStaticMiddleware(
  options: StaticMiddlewareOptions
): Middleware {
  return async (ctx, next) => {
    const { req, res, context } = ctx;
    const path = context.path || "";

    if (!options.rootPath || !path.startsWith("/public/")) {
      await next();
      return;
    }

    try {
      const filePath = join(options.rootPath, path.substring(8)); // Remove "/public/"
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        await next();
        return;
      }

      const content = await readFile(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase();
      const contentTypeMap: Record<string, string> = {
        html: "text/html",
        css: "text/css",
        js: "application/javascript",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
      };
      const contentType = contentTypeMap[ext || ""] || "application/octet-stream";

      setNoCacheHeaders(res);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      // Don't call next() - we've handled the request
    } catch (error) {
      await next();
    }
  };
}

function setNoCacheHeaders(res: any): void {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

