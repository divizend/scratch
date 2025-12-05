import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { marked } from "marked";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { jwtVerify, SignJWT } from "jose";
import { Universe, emailQueue, QueuedEmail, Resend } from "./src";

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

// Scratch extension configuration
const HOSTED_AT = process.env.HOSTED_AT || "scratch.divizend.ai";
const ORG_NAME = process.env.ORG_NAME || "divizend";
const port = process.env.PORT || 3000;

// Determine the base URL for the extension based on whether we're running locally
function getBaseUrl(c: any): string {
  const host = c.req.header("host") || "";
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("::1") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  if (isLocal) {
    return `http://localhost:${port}`;
  }

  // Use HOSTED_AT, ensuring it has a protocol
  const hostedAt = HOSTED_AT.startsWith("http")
    ? HOSTED_AT
    : `https://${HOSTED_AT}`;
  return hostedAt;
}

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

// Helper function to convert email to hyphenated name (e.g., "julian.nalenz@divizend.com" -> "julian-nalenz")
function emailToHyphenatedName(email: string): string {
  const localPart = email.split("@")[0] || "";
  return localPart.replace(/\./g, "-").toLowerCase();
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

// Validation middleware that checks request body against block arguments
function validateArguments(block: ScratchBlock) {
  return async (c: any, next: any) => {
    try {
      const body = await c.req.json();
      const errors: string[] = [];
      const validatedBody: any = { ...body };

      // Check all arguments defined in the block
      if (block.arguments) {
        for (const [key, arg] of Object.entries(block.arguments)) {
          // If argument is missing
          if (!(key in validatedBody)) {
            // If it has a default value, apply it
            if (arg.defaultValue !== undefined) {
              validatedBody[key] = arg.defaultValue;
            } else {
              // Otherwise, it's required and missing
              errors.push(`Missing required parameter: ${key}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        return c.json(
          {
            error: "Validation failed",
            errors,
          },
          400
        );
      }

      // Attach validated body (with defaults applied) to context for use in handler
      c.validatedBody = validatedBody;
      return next();
    } catch (error) {
      return c.json({ error: "Invalid request body" }, 400);
    }
  };
}

// Helper function to register a Scratch endpoint
// Automatically generates endpoint path as /api/{opcode} and uses POST method
// Also registers the route handler with Hono
// Automatically applies JWT auth (unless noAuth is true), argument validation, try-catch, and JSON response
function registerScratchEndpoint({
  block,
  handler,
  noAuth = false,
}: {
  block: ScratchBlock;
  handler: (c: any) => Promise<any> | any;
  noAuth?: boolean;
}) {
  const endpoint = `/api/${block.opcode}`;
  scratchEndpoints.push({ opcode: block.opcode, block, endpoint });

  // Wrap handler with automatic error handling and JSON response
  const wrappedHandler = async (c: any) => {
    try {
      const result = await handler(c);
      // If handler returns a Response, use it directly
      if (result instanceof Response) {
        return result;
      }
      // Otherwise, wrap in JSON response
      return c.json(result || { success: true });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  };

  // Build middleware array conditionally
  const middlewares: Array<(c: any, next?: any) => Promise<any> | any> = [];
  if (!noAuth) {
    middlewares.push(jwtAuth);
  }
  middlewares.push(validateArguments(block));
  middlewares.push(wrappedHandler);

  // Register the route with Hono
  app.post(endpoint, ...middlewares);
}

// JWT secret from environment
const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
const JWT_SECRET_KEY = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;

// Helper to validate JWT token and extract payload
async function validateJwtToken(token: string): Promise<any | null> {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload;
  } catch (error) {
    return null;
  }
}

// Helper to extract JWT payload from request header
const getJwtPayload = async (c: any) => {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  return await validateJwtToken(token);
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

// Email endpoint - queues emails instead of sending immediately
registerScratchEndpoint({
  block: {
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
  },
  handler: (c) => {
    // Use validated body from middleware
    const { from, to, subject, content } = c.validatedBody;

    // Add to queue instead of sending immediately
    const queuedEmail = emailQueue.add({
      from,
      to,
      subject,
      content,
    });

    return {
      success: true,
      id: queuedEmail.id,
      message: "Email queued",
    };
  },
});

// Admin API: Get available domains (public, for JWT sending)
app.get("/admin/api/domains", async (c) => {
  if (!universe || !universe.gsuite) {
    return c.json({ domains: [], available: false });
  }

  try {
    const orgConfigs = (universe.gsuite as any).orgConfigs;
    if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
      return c.json({ domains: [], available: false });
    }

    // Collect all domains from all organizations
    const allDomains: string[] = [];
    for (const orgConfig of Object.values(orgConfigs) as any[]) {
      for (const domain of orgConfig.domains) {
        if (domain.domainName) {
          allDomains.push(domain.domainName);
        }
      }
    }

    return c.json({ domains: allDomains, available: true });
  } catch (error) {
    return c.json({
      domains: [],
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Admin API: Send JWT token via email
app.post("/admin/api/send-jwt", async (c) => {
  if (!universe || !universe.gsuite) {
    return c.json({ error: "Google Workspace not connected" }, 400);
  }

  const { email } = await c.req.json();
  if (!email || typeof email !== "string") {
    return c.json({ error: "Email address is required" }, 400);
  }

  // Validate email domain
  const emailDomain = email.split("@")[1];
  if (!emailDomain) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  try {
    const orgConfigs = (universe.gsuite as any).orgConfigs;
    if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
      return c.json(
        { error: "No Google Workspace organizations configured" },
        400
      );
    }

    // Check if email domain matches any organization domain
    let matchingOrg: any = null;
    for (const orgConfig of Object.values(orgConfigs) as any[]) {
      for (const domain of orgConfig.domains) {
        if (domain.domainName === emailDomain) {
          matchingOrg = orgConfig;
          break;
        }
      }
      if (matchingOrg) break;
    }

    if (!matchingOrg) {
      return c.json(
        {
          error: `Email domain ${emailDomain} is not part of any configured Google Workspace organization`,
        },
        400
      );
    }

    // Generate JWT token
    const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
    if (!JWT_SECRET) {
      return c.json({ error: "JWT secret not configured" }, 500);
    }

    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const jwt = await new SignJWT({
      email: email,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1y")
      .sign(secretKey);

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return c.json(
        { error: "RESEND_API_KEY environment variable is not set" },
        500
      );
    }

    const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
    const resend = new Resend(resendApiKey, resendApiRoot);

    const response = await resend.sendEmail({
      from: "jwt-issuer@divizend.ai",
      to: email,
      subject: "Admin Access Token",
      html: `<p>Your admin access token is:</p><pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${jwt}</pre><p>Use this token to authenticate in the admin interface.</p>`,
    });

    if (!response.ok) {
      return c.json({ error: `Failed to send email: ${response.text}` }, 500);
    }

    return c.json({ success: true, message: "JWT token sent successfully" });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send JWT token",
      },
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
  return c.json({ queue: emailQueue.getAll() });
});

// Admin API: Clear queue
app.post("/admin/api/queue/clear", jwtAuth, async (c) => {
  emailQueue.clear();
  return c.json({ success: true, message: "Queue cleared" });
});

// Admin API: Send emails (all or selected)
app.post("/admin/api/queue/send", jwtAuth, async (c) => {
  if (emailQueue.getIsSending()) {
    return c.json({ error: "Email sending already in progress" }, 409);
  }

  const { ids } = await c.req.json();

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return c.json(
      { error: "RESEND_API_KEY environment variable is not set" },
      500
    );
  }

  const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";

  try {
    const result = await emailQueue.send(ids, resendApiKey, resendApiRoot);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Admin API: Remove selected emails
app.post("/admin/api/queue/remove", jwtAuth, async (c) => {
  const { ids } = await c.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: "Invalid or empty ids array" }, 400);
  }

  const removed = emailQueue.removeByIds(ids);

  return c.json({
    success: true,
    removed,
    message: `Removed ${removed} email(s)`,
  });
});

// Generate and serve Scratch extension file dynamically
// Route pattern: /extension/{jwt}.js where jwt is a valid JWT token
app.get("*", async (c, next) => {
  const path = c.req.path;

  // Only handle paths that match /extension/{jwt}.js pattern (not admin, api, etc.)
  // JWT tokens contain base64url characters: a-z, A-Z, 0-9, -, _, and dots
  const match = path.match(/^\/extension\/([A-Za-z0-9\-_\.]+)\.js$/);

  if (!match) {
    return next();
  }

  const jwtToken = match[1];

  // Validate JWT token
  const payload = await validateJwtToken(jwtToken);
  if (!payload) {
    return c.text("Invalid or expired JWT token", 401);
  }

  // Extract email from JWT payload
  const email = (payload as any)?.email;
  if (!email || typeof email !== "string") {
    return c.text("JWT token does not contain a valid email address", 400);
  }

  // Convert email to hyphenated name (e.g., "julian.nalenz@divizend.com" -> "julian-nalenz")
  const name = emailToHyphenatedName(email);

  // Generate extension ID and name from the email-derived name
  const { id: extensionId, displayName: extensionName } =
    generateExtensionInfo(name);

  // Determine the base URL for this request
  const baseUrl = getBaseUrl(c);

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
    return fetch("${baseUrl}${ep.endpoint}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${jwtToken}",
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

console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
