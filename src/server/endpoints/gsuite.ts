import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";

// GSuite endpoints
export const gsuiteEndpoints: ScratchEndpointDefinition[] = [
  // GSuite Admin endpoints
  // Get all users in the organization
  {
    block: async (context) => ({
      opcode: "getUsers",
      blockType: "reporter",
      text: "organization users",
    }),
    handler: async (context) => {
      if (!context.userEmail) {
        return [];
      }

      try {
        const gsuiteUser = context.universe!.gsuite.user(context.userEmail);
        const admin = gsuiteUser.admin();
        const users = await admin.getUsers();
        return users.map((user) => ({
          email: user.primaryEmail,
          name: user.name?.fullName,
        }));
      } catch (error) {
        return [];
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Gmail endpoints
  // Get Gmail labels
  {
    block: async (context) => ({
      opcode: "getGmailLabels",
      blockType: "reporter",
      text: "Gmail labels for user [userEmail]",
      schema: {
        userEmail: {
          type: "string",
          default: context.userEmail ?? "",
          description: "Gmail user email address",
        },
      },
    }),
    handler: async (context) => {
      const { userEmail } = context.validatedBody!;
      const email = userEmail;

      try {
        const gsuiteUser = context.universe!.gsuite.user(email);
        const gmail = gsuiteUser.gmail();
        const labels = await gmail.getLabels();
        return labels.map((label) => ({
          id: label.id,
          name: label.name,
        }));
      } catch (error) {
        return [];
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // List Gmail messages
  {
    block: async (context) => ({
      opcode: "listGmailMessages",
      blockType: "reporter",
      text: "Gmail messages with label [label] limit [limit] for user [userEmail]",
      schema: {
        label: {
          type: "string",
          default: "INBOX",
          description: "Gmail label to filter messages",
        },
        limit: {
          type: "string",
          default: "10",
          description: "Maximum number of messages to retrieve",
        },
        userEmail: {
          type: "string",
          default: context.userEmail ?? "",
          description: "Gmail user email address",
        },
      },
    }),
    handler: async (context) => {
      const { label, limit, userEmail } = context.validatedBody!;
      const email = userEmail;

      try {
        const gsuiteUser = context.universe!.gsuite.user(email);
        const gmail = gsuiteUser.gmail();
        const limitNum = parseInt(limit || "10", 10) || 10;
        const labelFilter = label && label.trim() ? label.trim() : undefined;

        const messages: any[] = [];
        let count = 0;
        for await (const message of gmail.listMessages(labelFilter, {
          limit: limitNum,
          full: true,
        })) {
          messages.push({
            id: message.message.id,
            threadId: message.message.threadId,
            snippet: message.message.snippet,
          });
          count++;
          if (count >= limitNum) break;
        }
        return messages;
      } catch (error) {
        return [];
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Drive endpoints
  // Copy a Drive file
  {
    block: async (context) => ({
      opcode: "copyDriveFile",
      blockType: "command",
      text: "copy Google Drive file [sourceFileId] to folder [destFolderId] with name [name]",
      schema: {
        sourceFileId: {
          type: "string",
          default: "",
          description: "Source Google Drive file ID",
        },
        destFolderId: {
          type: "string",
          default: "",
          description: "Destination folder ID",
        },
        name: {
          type: "string",
          default: "Copy",
          description: "Name for the copied file",
        },
      },
    }),
    handler: async (context) => {
      const { sourceFileId, destFolderId, name } = context.validatedBody!;

      try {
        const gsuiteUser = context.universe!.gsuite.user(context.userEmail);
        const drive = gsuiteUser.drive();
        const newFile = await drive.copyFile({
          sourceFileId,
          destFolderId,
          name,
        });
        return {
          success: true,
          id: newFile.id,
          name: newFile.file.name || "",
        };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to copy Drive file"
        );
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },
];
