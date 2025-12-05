import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { marked } from "marked";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = __dirname;

const app = new Hono();

// CORS middleware - allow all origins, methods, and headers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  })
);

// Middleware to set no-cache headers
app.use("*", async (c, next) => {
  await next();
  // Set no-cache headers for all responses
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

// Serve README.md from root (formatted as HTML)
app.get("/", async (c) => {
  try {
    const readmePath = join(projectRoot, "README.md");
    const readme = await Bun.file(readmePath).text();
    const html = await marked(readme);
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

// Email endpoint
app.post("/api/send-email", async (c) => {
  try {
    const { from, to, subject, content, resendApiKey } = await c.req.json();

    if (!from || !to || !subject || !content || !resendApiKey) {
      return c.json(
        {
          error:
            "Missing required parameters: from, to, subject, content, resendApiKey",
        },
        400
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: `<p>${content}</p>`,
      }),
    });

    const responseText = await response.text();
    return new Response(responseText, {
      status: response.status,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Serve static files from public directory
app.use("/*", serveStatic({ root: join(projectRoot, "public") }));

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
