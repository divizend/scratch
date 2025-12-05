import { Hono } from "hono";
import { registerScratchEndpoint } from "./scratch";
import { emailQueue } from "../queue";
import { Universe, Resend } from "../";
import { getJwtPayload } from "./auth";
import { SignJWT } from "jose";

let universe: Universe | null = null;

export function setUniverse(u: Universe | null) {
  universe = u;
}

// Register all Scratch endpoints
export function registerEndpoints(app: Hono) {
  // Email endpoint - queues emails instead of sending immediately
  registerScratchEndpoint(app, {
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
      const { from, to, subject, content } = c.validatedBody;
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

  // Get available domains (public, for JWT sending)
  registerScratchEndpoint(app, {
    block: {
      opcode: "getDomains",
      blockType: "reporter",
      text: "get domains",
      arguments: {},
    },
    handler: (c) => {
      if (!universe || !universe.gsuite) {
        return { domains: [], available: false };
      }

      try {
        const orgConfigs = (universe.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return { domains: [], available: false };
        }

        const allDomains: string[] = [];
        for (const orgConfig of Object.values(orgConfigs) as any[]) {
          for (const domain of orgConfig.domains) {
            if (domain.domainName) {
              allDomains.push(domain.domainName);
            }
          }
        }

        return { domains: allDomains, available: true };
      } catch (error) {
        return {
          domains: [],
          available: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    noAuth: true,
  });

  // Send JWT token via email
  registerScratchEndpoint(app, {
    block: {
      opcode: "sendJwt",
      blockType: "command",
      text: "send jwt to [email]",
      arguments: {
        email: {
          type: "string",
          defaultValue: "",
        },
      },
    },
    handler: async (c) => {
      const { email } = c.validatedBody;

      if (!universe || !universe.gsuite) {
        throw new Error("Google Workspace not connected");
      }

      // Validate email domain
      const orgConfigs = (universe.gsuite as any).orgConfigs;
      if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
        throw new Error("No GSuite organizations configured");
      }

      const allDomains: string[] = [];
      for (const orgConfig of Object.values(orgConfigs) as any[]) {
        for (const domain of orgConfig.domains) {
          if (domain.domainName) {
            allDomains.push(domain.domainName);
          }
        }
      }

      const emailDomain = email.split("@")[1];
      if (!allDomains.includes(emailDomain)) {
        throw new Error(
          `Email domain ${emailDomain} is not in the allowed domains list`
        );
      }

      // Generate JWT token
      const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
      if (!JWT_SECRET) {
        throw new Error("JWT secret not configured");
      }

      const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
      const jwt = await new SignJWT({ email })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(JWT_SECRET_KEY);

      // Send email via Resend
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY environment variable is not set");
      }

      const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
      const resend = new Resend(resendApiKey, resendApiRoot);

      const response = await resend.sendEmail({
        from: "jwt-issuer@divizend.ai",
        to: email,
        subject: "Admin Access Token",
        html: `<p>Your admin access token is:</p><pre><code>${jwt}</code></pre><p>Use this token to authenticate in the admin interface.</p>`,
      });

      if (!response.ok) {
        throw new Error(`Failed to send email: ${response.text}`);
      }

      return { success: true, message: "JWT token sent successfully" };
    },
    noAuth: true,
  });

  // Get current user email
  registerScratchEndpoint(app, {
    block: {
      opcode: "getUser",
      blockType: "reporter",
      text: "get user",
      arguments: {},
    },
    handler: async (c) => {
      const payload = await getJwtPayload(c);
      return { email: (payload as any)?.email || "Unknown" };
    },
  });

  // Health check for googleapis connection
  registerScratchEndpoint(app, {
    block: {
      opcode: "getHealth",
      blockType: "reporter",
      text: "get health",
      arguments: {},
    },
    handler: async (c) => {
      if (!universe || !universe.gsuite) {
        return {
          status: "error",
          message: "Universe not initialized",
          connected: false,
        };
      }

      try {
        const orgConfigs = (universe.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return {
            status: "error",
            message: "No GSuite organizations configured",
            connected: false,
          };
        }

        const firstOrg = Object.keys(orgConfigs)[0];
        const orgConfig = orgConfigs[firstOrg];
        const gsuiteUser = universe.gsuite.user(orgConfig.adminUser);
        const admin = gsuiteUser.admin();

        await admin.getDomains();

        return {
          status: "ok",
          message: "Google APIs connection active",
          connected: true,
          organization: firstOrg,
        };
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          connected: false,
        };
      }
    },
  });

  // Get queue
  registerScratchEndpoint(app, {
    block: {
      opcode: "getQueue",
      blockType: "reporter",
      text: "get queue",
      arguments: {},
    },
    handler: (c) => {
      return { queue: emailQueue.getAll() };
    },
  });

  // Clear queue
  registerScratchEndpoint(app, {
    block: {
      opcode: "clearQueue",
      blockType: "command",
      text: "clear queue",
      arguments: {},
    },
    handler: (c) => {
      emailQueue.clear();
      return { success: true, message: "Queue cleared" };
    },
  });

  // Send emails (all or selected)
  registerScratchEndpoint(app, {
    block: {
      opcode: "sendEmails",
      blockType: "command",
      text: "send emails [ids]",
      arguments: {
        ids: {
          type: "string",
          defaultValue: "null",
        },
      },
    },
    handler: async (c) => {
      if (emailQueue.getIsSending()) {
        throw new Error("Email sending already in progress");
      }

      const { ids } = c.validatedBody;
      const idsArray =
        !ids || ids === "" || ids === "null" ? null : JSON.parse(ids);

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY environment variable is not set");
      }

      const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
      return await emailQueue.send(idsArray, resendApiKey, resendApiRoot);
    },
  });

  // Remove selected emails
  registerScratchEndpoint(app, {
    block: {
      opcode: "removeEmails",
      blockType: "command",
      text: "remove emails [ids]",
      arguments: {
        ids: {
          type: "string",
          defaultValue: "[]",
        },
      },
    },
    handler: (c) => {
      const { ids } = c.validatedBody;
      const idsArray = JSON.parse(ids);

      if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      const removed = emailQueue.removeByIds(idsArray);
      return {
        success: true,
        removed,
        message: `Removed ${removed} email(s)`,
      };
    },
  });
}
