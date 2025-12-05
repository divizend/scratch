import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { marked } from "marked";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { jwtVerify } from "jose";
import { Universe } from "./src";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = __dirname;

const app = new Hono();

// Initialize Universe instance on startup
let universe: Universe | null = null;
(async () => {
  try {
    universe = await Universe.construct({ gsuite: true });
    console.log("Universe initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Universe:", error);
  }
})();

// Email queue storage
interface QueuedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: string;
  queuedAt: number;
}

// Scratch extension block definition
interface ScratchBlock {
  opcode: string;
  blockType: "command" | "reporter" | "boolean" | "hat";
  text: string;
  arguments: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      defaultValue: string | number | boolean;
    };
  };
}

// Scratch endpoint annotation
interface ScratchEndpoint {
  opcode: string;
  block: ScratchBlock;
  endpoint: string;
}

const emailQueue: QueuedEmail[] = [];
let isSending = false;

// Scratch extension configuration
const SCRATCH_BASE_URL =
  process.env.SCRATCH_BASE_URL || "https://scratch.divizend.ai";
const ORG_NAME = process.env.ORG_NAME || "divizend";

// Registry of Scratch endpoints
const scratchEndpoints: ScratchEndpoint[] = [];

// Helper function to convert string to PascalCase (first letter uppercase, rest lowercase)
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper function to convert hyphenated string to PascalCase
function hyphenatedToPascalCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// Helper function to convert hyphenated string to Title Case
function toTitleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Helper function to generate extension ID and name from hyphenated string
function generateExtensionInfo(name: string): {
  id: string;
  displayName: string;
} {
  const orgPascalCase = toPascalCase(ORG_NAME);
  const namePascalCase = hyphenatedToPascalCase(name);
  const nameTitleCase = toTitleCase(name);
  return {
    id: `${orgPascalCase}${namePascalCase}`,
    displayName: `${orgPascalCase} (${nameTitleCase})`,
  };
}

// Helper function to register a Scratch endpoint
// Automatically generates endpoint path as /api/{opcode} and uses POST method
function registerScratchEndpoint(opcode: string, block: ScratchBlock) {
  const endpoint = `/api/${opcode}`;
  scratchEndpoints.push({ opcode, block, endpoint });
}

// JWT secret from environment
const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
const JWT_SECRET_KEY = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;

// Helper to extract JWT payload
const getJwtPayload = async (c: any) => {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload;
  } catch (error) {
    return null;
  }
};

// JWT authentication middleware
const jwtAuth = async (c: any, next: any) => {
  if (!JWT_SECRET_KEY) {
    return c.json({ error: "JWT authentication not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  try {
    await jwtVerify(token, JWT_SECRET_KEY);
    await next();
  } catch (error) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

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

// Email endpoint - queues emails instead of sending immediately
registerScratchEndpoint("queueEmail", {
  opcode: "queueEmail",
  blockType: "command",
  text: "queue email [from] [to] [subject] [content]",
  arguments: {
    from: {
      type: "string",
      defaultValue: "scratch-demo@divizend.ai",
    },
    to: {
      type: "string",
      defaultValue: "julian.nalenz@divizend.com",
    },
    subject: {
      type: "string",
      defaultValue: "Hello from a Scratch block!",
    },
    content: {
      type: "string",
      defaultValue: "This email was sent from a Scratch block!",
    },
  },
});

app.post("/api/queueEmail", async (c) => {
  try {
    const { from, to, subject, content } = await c.req.json();

    if (!from || !to || !subject || !content) {
      return c.json(
        {
          error: "Missing required parameters: from, to, subject, content",
        },
        400
      );
    }

    // Add to queue instead of sending immediately
    const queuedEmail: QueuedEmail = {
      id: crypto.randomUUID(),
      from,
      to,
      subject,
      content,
      queuedAt: Date.now(),
    };

    emailQueue.push(queuedEmail);

    return c.json({
      success: true,
      id: queuedEmail.id,
      message: "Email queued",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Admin API: Get user info
app.get("/admin/api/user", jwtAuth, async (c) => {
  const payload = await getJwtPayload(c);
  return c.json({ email: (payload as any)?.email || "Unknown" });
});

// Admin API: Health check for googleapis connection
app.get("/admin/api/health", jwtAuth, async (c) => {
  if (!universe || !universe.gsuite) {
    return c.json({
      status: "error",
      message: "Universe not initialized",
      connected: false,
    });
  }

  try {
    // Test connection by trying to get domains from the first organization
    const orgConfigs = (universe.gsuite as any).orgConfigs;
    if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
      return c.json({
        status: "error",
        message: "No GSuite organizations configured",
        connected: false,
      });
    }

    const firstOrg = Object.keys(orgConfigs)[0];
    const orgConfig = orgConfigs[firstOrg];
    const gsuiteUser = universe.gsuite.user(orgConfig.adminUser);
    const admin = gsuiteUser.admin();

    // Try to list domains as a health check
    await admin.getDomains();

    return c.json({
      status: "ok",
      message: "Google APIs connection active",
      connected: true,
      organization: firstOrg,
    });
  } catch (error) {
    return c.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
      connected: false,
    });
  }
});

// Admin API: Get queue
app.get("/admin/api/queue", jwtAuth, async (c) => {
  return c.json({ queue: emailQueue });
});

// Admin API: Clear queue
app.post("/admin/api/queue/clear", jwtAuth, async (c) => {
  emailQueue.length = 0;
  return c.json({ success: true, message: "Queue cleared" });
});

// Admin API: Send emails (all or selected)
app.post("/admin/api/queue/send", jwtAuth, async (c) => {
  if (isSending) {
    return c.json({ error: "Email sending already in progress" }, 409);
  }

  const { ids } = await c.req.json();
  const emailsToSend =
    ids === null
      ? emailQueue
      : emailQueue.filter((email) => ids.includes(email.id));

  if (emailsToSend.length === 0) {
    return c.json({ success: true, sent: 0, message: "No emails to send" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return c.json(
      { error: "RESEND_API_KEY environment variable is not set" },
      500
    );
  }

  isSending = true;
  let sent = 0;
  let errors = 0;

  // Send emails with rate limiting (100ms delay between emails to avoid rate limits)
  for (let i = 0; i < emailsToSend.length; i++) {
    const email = emailsToSend[i];
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: `<p>${email.content}</p>`,
        }),
      });

      if (response.ok) {
        sent++;
        // Remove sent email from queue
        const index = emailQueue.findIndex((e) => e.id === email.id);
        if (index !== -1) {
          emailQueue.splice(index, 1);
        }
      } else {
        errors++;
      }

      // Rate limiting: wait 100ms between emails (allows up to 10 emails/second)
      if (i < emailsToSend.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      errors++;
    }
  }

  isSending = false;

  return c.json({
    success: true,
    sent,
    errors,
    message: `Sent ${sent} email(s)${errors > 0 ? `, ${errors} error(s)` : ""}`,
  });
});

// Admin API: Remove selected emails
app.post("/admin/api/queue/remove", jwtAuth, async (c) => {
  const { ids } = await c.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: "Invalid or empty ids array" }, 400);
  }

  const initialLength = emailQueue.length;
  const filtered = emailQueue.filter((email) => !ids.includes(email.id));
  emailQueue.length = 0;
  emailQueue.push(...filtered);
  const removed = initialLength - emailQueue.length;

  return c.json({
    success: true,
    removed,
    message: `Removed ${removed} email(s)`,
  });
});

// Generate and serve Scratch extension file dynamically
// Route pattern: /{name}.js where name is hyphenated (e.g., julian-nalenz)
app.get("*", async (c, next) => {
  const path = c.req.path;

  // Only handle paths that match /{name}.js pattern (not admin, api, etc.)
  const match = path.match(/^\/([a-z0-9-]+)\.js$/);

  if (!match) {
    return next();
  }

  const name = match[1];

  // Validate name format (only lowercase letters, numbers, and hyphens)
  if (!/^[a-z0-9-]+$/.test(name)) {
    return c.text("Invalid extension name format", 400);
  }

  // Generate extension ID and name from the hyphenated string
  const { id: extensionId, displayName: extensionName } =
    generateExtensionInfo(name);

  // Generate the Scratch extension class
  const blocks = scratchEndpoints.map((ep) => ep.block);
  const methods = scratchEndpoints
    .map((ep) => {
      const params = Object.keys(ep.block.arguments);
      const paramList = params.join(", ");
      const fetchBody =
        params.length > 0
          ? `body: JSON.stringify({ ${params.map((p) => `${p}`).join(", ")} })`
          : "";

      return `  ${ep.opcode}({ ${paramList} }) {
    return fetch("${SCRATCH_BASE_URL}${ep.endpoint}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      }${fetchBody ? `,\n      ${fetchBody}` : ""}
    }).then((response) => response.text());
  }`;
    })
    .join("\n\n");

  const extensionCode = `class ${extensionId} {
  constructor() {}

  getInfo() {
    return {
      id: "${extensionId}",
      name: "${extensionName}",
      blocks: ${JSON.stringify(blocks, null, 2)},
    };
  }

${methods}
}

Scratch.extensions.register(new ${extensionId}());`;

  return c.text(extensionCode, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
  });
});

// Serve static files from public directory
app.use("/*", serveStatic({ root: join(projectRoot, "public") }));

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
