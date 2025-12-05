import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { marked } from "marked";
import { join } from "path";

// Serve README.md from root (formatted as HTML)
export function registerStaticRoutes(app: Hono, projectRoot: string) {
  app.get("/", async (c) => {
    try {
      const readmePath = join(projectRoot, "README.md");
      const readme = await Bun.file(readmePath).text();
      let html = await marked(readme);

      // Add target="_blank" and rel="noopener noreferrer" to all links
      html = html.replace(/<a\s+([^>]*?)>/gi, (match, attributes) => {
        // Check if target is already set
        if (!/target\s*=/i.test(attributes)) {
          attributes += ' target="_blank" rel="noopener noreferrer"';
        }
        return `<a ${attributes}>`;
      });

      const styledHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>README</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 { border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 24px; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-size: 85%; }
    pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background-color: transparent; padding: 0; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
      return c.html(styledHtml);
    } catch (error) {
      return c.text("README.md not found", 404);
    }
  });

  // Serve static files from public directory
  app.use("/*", serveStatic({ root: join(projectRoot, "public") }));
}
