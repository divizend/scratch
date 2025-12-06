import { ScratchEndpointDefinition } from "../scratch";
import { emailQueue } from "../../queue";
import { Resend } from "../../";
import { getUniverse } from "../universe";

// Email queue endpoints
export const emailQueueEndpoints: ScratchEndpointDefinition[] = [
  // Email endpoint - adds emails to email queue (Resend) or sends immediately (Gmail)
  {
    block: async (context) => ({
      opcode: "queueEmail",
      blockType: "command",
      text: "add email to queue from [from] to [to] subject [subject] content [content]",
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

      if (!from || !to || !subject || !content) {
        throw new Error("from, to, subject, and content are required");
      }

      // Extract domain from "from" email address
      const fromDomain = from.split("@")[1];
      if (!fromDomain) {
        throw new Error(`Invalid email address: ${from}`);
      }

      // Get Resend domains
      let resendDomains: string[] = [];
      try {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey) {
          const resendApiRoot = process.env.RESEND_API_ROOT || "api.resend.com";
          const resend = new Resend(resendApiKey, resendApiRoot);
          resendDomains = await resend.getDomains();
        }
      } catch (error) {
        // If Resend API fails, continue with empty array
        console.warn("Failed to fetch Resend domains:", error);
      }

      // Get Google Workspace domains
      let gsuiteDomains: string[] = [];
      const universe = getUniverse();
      if (universe && universe.gsuite) {
        try {
          const orgConfigs = (universe.gsuite as any).orgConfigs;
          if (orgConfigs && Object.keys(orgConfigs).length > 0) {
            for (const orgConfig of Object.values(orgConfigs) as any[]) {
              for (const domain of orgConfig.domains) {
                if (domain.domainName) {
                  gsuiteDomains.push(domain.domainName);
                }
              }
            }
          }
        } catch (error) {
          // If GSuite domain fetch fails, continue with empty array
          console.warn("Failed to fetch GSuite domains:", error);
        }
      }

      // Validate domain is recognized
      const isResendDomain = resendDomains.includes(fromDomain);
      const isGsuiteDomain = gsuiteDomains.includes(fromDomain);

      if (!isResendDomain && !isGsuiteDomain) {
        throw new Error(
          `Unrecognized sender domain: ${fromDomain}. Domain must be either a verified Resend domain or a Google Workspace domain.`
        );
      }

      // Queue the email - routing will happen when sending
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
  },

  // Get email queue
  {
    block: async (context) => ({
      opcode: "getEmailQueue",
      blockType: "reporter",
      text: "queued emails",
      arguments: {},
    }),
    handler: async (context) => {
      return emailQueue.getAll();
    },
  },

  // Clear email queue
  {
    block: async (context) => ({
      opcode: "clearEmailQueue",
      blockType: "command",
      text: "clear all queued emails",
      arguments: {},
    }),
    handler: async (context) => {
      emailQueue.clear();
      return { success: true, message: "Email queue cleared" };
    },
  },

  // Send all emails
  {
    block: async (context) => ({
      opcode: "sendAllEmails",
      blockType: "command",
      text: "send all queued emails",
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
  },

  // Send selected emails
  {
    block: async (context) => ({
      opcode: "sendSelectedEmails",
      blockType: "command",
      text: "send selected queued emails [ids]",
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
  },

  // Remove selected emails
  {
    block: async (context) => ({
      opcode: "removeEmails",
      blockType: "command",
      text: "remove queued emails [ids]",
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
  },
];
