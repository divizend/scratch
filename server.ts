import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";

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
app.use("/*", serveStatic({ root: "./public" }));

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
