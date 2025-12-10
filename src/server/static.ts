import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { marked } from "marked";
import { join } from "path";

// Serve static files from public directory
export function registerStaticRoutes(app: Hono, projectRoot: string) {
  // Serve static files from public directory
  app.use("/*", serveStatic({ root: join(projectRoot, "public") }));
}
