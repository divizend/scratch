import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";

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
      const { from, to, subject, content } = context.validatedBody!;

      // Extract domain from "from" email address
      const fromDomain = from.split("@")[1];
      if (!fromDomain) {
        throw new Error(`Invalid email address: ${from}`);
      }

      // Validate domain using the email queue
      const isValidDomain = await context.universe!.emailQueue.validateDomain(
        fromDomain
      );
      if (!isValidDomain) {
        throw new Error(
          `Unrecognized sender domain: ${fromDomain}. Domain must be handled by one of the configured email profiles.`
        );
      }

      // Queue the email - routing will happen when sending
      const queuedEmail = context.universe!.emailQueue.add({
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
    requiredModules: [UniverseModule.EmailQueue],
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
      return context.universe!.emailQueue.getAll();
    },
    requiredModules: [UniverseModule.EmailQueue],
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
      context.universe!.emailQueue.clear();
      return { success: true, message: "Email queue cleared" };
    },
    requiredModules: [UniverseModule.EmailQueue],
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
      return await context.universe!.emailQueue.send(null);
    },
    requiredModules: [UniverseModule.EmailQueue],
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
      const { ids } = context.validatedBody!;
      const idsArray = JSON.parse(ids);

      if (!Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      return await context.universe!.emailQueue.send(idsArray);
    },
    requiredModules: [UniverseModule.EmailQueue],
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
      const { ids } = context.validatedBody!;
      const idsArray = JSON.parse(ids);

      if (!Array.isArray(idsArray) || idsArray.length === 0) {
        throw new Error("Invalid or empty ids array");
      }

      const removed = context.universe!.emailQueue.removeByIds(idsArray);
      return {
        success: true,
        removed,
        message: `Removed ${removed} email(s)`,
      };
    },
    requiredModules: [UniverseModule.EmailQueue],
  },
];
