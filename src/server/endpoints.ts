import { Hono } from "hono";
import { registerScratchEndpoint } from "./scratch";
import { emailQueue } from "../queue";
import { Universe, Resend } from "../";
import { getJwtPayload, signJwtToken } from "./auth";

let universe: Universe | null = null;

export function setUniverse(u: Universe | null) {
  universe = u;
}

// Register all Scratch endpoints
export async function registerEndpoints(app: Hono) {
  // Email endpoint - adds emails to email queue instead of sending immediately
  await registerScratchEndpoint(app, {
    block: async (context) => ({
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
          defaultValue: context.userEmail ?? "julian.nalenz@divizend.com",
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
    }),
    handler: async (context) => {
      const { from, to, subject, content } = context.validatedBody || {};
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
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "getDomains",
      blockType: "reporter",
      text: "domains",
      arguments: {},
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite) {
        return [];
      }

      try {
        const orgConfigs = (universe.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return [];
        }

        const allDomains: string[] = [];
        for (const orgConfig of Object.values(orgConfigs) as any[]) {
          for (const domain of orgConfig.domains) {
            if (domain.domainName) {
              allDomains.push(domain.domainName);
            }
          }
        }

        return allDomains;
      } catch (error) {
        return [];
      }
    },
    noAuth: true,
  });

  // Send JWT token via email
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "sendJwt",
      blockType: "command",
      text: "send jwt to [email]",
      arguments: {
        email: {
          type: "string",
          defaultValue: context.userEmail ?? "",
        },
      },
    }),
    handler: async (context) => {
      const { email } = context.validatedBody || {};

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
      const jwt = await signJwtToken({ email });

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
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "getUser",
      blockType: "reporter",
      text: "user",
      arguments: {},
    }),
    handler: async (context) => {
      return { email: context.userEmail || "Unknown" };
    },
  });

  // Health check for googleapis connection
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "getHealth",
      blockType: "reporter",
      text: "health",
      arguments: {},
    }),
    handler: async (context) => {
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

  // Get email queue
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "getEmailQueue",
      blockType: "reporter",
      text: "emailQueue",
      arguments: {},
    }),
    handler: async (context) => {
      return { emailQueue: emailQueue.getAll() };
    },
  });

  // Clear email queue
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "clearEmailQueue",
      blockType: "command",
      text: "clear emailQueue",
      arguments: {},
    }),
    handler: async (context) => {
      emailQueue.clear();
      return { success: true, message: "Email queue cleared" };
    },
  });

  // Send all emails
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "sendAllEmails",
      blockType: "command",
      text: "send all emails",
      arguments: {},
    }),
    handler: async (context) => {
      if (emailQueue.getIsSending()) {
        throw new Error("Email sending already in progress");
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY environment variable is not set");
      }

      const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
      return await emailQueue.send(null, resendApiKey, resendApiRoot);
    },
  });

  // Send selected emails
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "sendSelectedEmails",
      blockType: "command",
      text: "send selected emails [ids]",
      arguments: {
        ids: {
          type: "string",
          defaultValue: "[]",
        },
      },
    }),
    handler: async (context) => {
      if (emailQueue.getIsSending()) {
        throw new Error("Email sending already in progress");
      }

      const { ids } = context.validatedBody || {};
      const idsArray = JSON.parse(ids);

      if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY environment variable is not set");
      }

      const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
      return await emailQueue.send(idsArray, resendApiKey, resendApiRoot);
    },
  });

  // Remove selected emails
  await registerScratchEndpoint(app, {
    block: async (context) => ({
      opcode: "removeEmails",
      blockType: "command",
      text: "remove emails [ids]",
      arguments: {
        ids: {
          type: "string",
          defaultValue: "[]",
        },
      },
    }),
    handler: async (context) => {
      const { ids } = context.validatedBody || {};
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
