import { ScratchEndpointDefinition } from "../scratch";
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

      // Get universe and email queue
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        throw new Error("Email queue not available");
      }

      // Validate domain using the email queue
      const isValidDomain = await universe.emailQueue.validateDomain(
        fromDomain
      );
      if (!isValidDomain) {
        throw new Error(
          `Unrecognized sender domain: ${fromDomain}. Domain must be handled by one of the configured email profiles.`
        );
      }

      // Queue the email - routing will happen when sending
      const queuedEmail = universe.emailQueue.add({
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
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        return [];
      }
      return universe.emailQueue.getAll();
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
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        throw new Error("Email queue not available");
      }
      universe.emailQueue.clear();
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
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        throw new Error("Email queue not available");
      }

      if (universe.emailQueue.getIsSending()) {
        throw new Error("Email sending already in progress");
      }

      return await universe.emailQueue.send(null);
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
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        throw new Error("Email queue not available");
      }

      if (universe.emailQueue.getIsSending()) {
        throw new Error("Email sending already in progress");
      }

      const { ids } = context.validatedBody || {};
      const idsArray = JSON.parse(ids);

      if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      return await universe.emailQueue.send(idsArray);
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
      const universe = getUniverse();
      if (!universe || !universe.emailQueue) {
        throw new Error("Email queue not available");
      }

      const { ids } = context.validatedBody || {};
      const idsArray = JSON.parse(ids);

      if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      const removed = universe.emailQueue.removeByIds(idsArray);
      return {
        success: true,
        removed,
        message: `Removed ${removed} email(s)`,
      };
    },
  },
];
