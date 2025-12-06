import { ScratchEndpointDefinition } from "../scratch";
import { getUniverse } from "../universe";

// GSuite endpoints
export const gsuiteEndpoints: ScratchEndpointDefinition[] = [
  // GSuite Admin endpoints
  // Get all users in the organization
  {
    block: async (context) => ({
      opcode: "getUsers",
      blockType: "reporter",
      text: "organization users",
      arguments: {},
    }),
    handler: async (context) => {
      const universe = getUniverse();
      if (!universe || !universe.gsuite || !context.userEmail) {
        return [];
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
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
  },

  // Gmail endpoints
  // Get Gmail labels
  {
    block: async (context) => ({
      opcode: "getGmailLabels",
      blockType: "reporter",
      text: "Gmail labels for user [userEmail]",
      arguments: {
        userEmail: {
          type: "string",
          defaultValue: context.userEmail ?? "",
        },
      },
    }),
    handler: async (context) => {
      const universe = getUniverse();
      const { userEmail } = context.validatedBody || {};
      const email = userEmail || context.userEmail;

      if (!universe || !universe.gsuite || !email) {
        return [];
      }

      try {
        const gsuiteUser = universe.gsuite.user(email);
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
  },

  // List Gmail messages
  {
    block: async (context) => ({
      opcode: "listGmailMessages",
      blockType: "reporter",
      text: "Gmail messages with label [label] limit [limit] for user [userEmail]",
      arguments: {
        label: {
          type: "string",
          defaultValue: "INBOX",
        },
        limit: {
          type: "string",
          defaultValue: "10",
        },
        userEmail: {
          type: "string",
          defaultValue: context.userEmail ?? "",
        },
      },
    }),
    handler: async (context) => {
      const universe = getUniverse();
      const { label, limit, userEmail } = context.validatedBody || {};
      const email = userEmail || context.userEmail;

      if (!universe || !universe.gsuite || !email) {
        return [];
      }

      try {
        const gsuiteUser = universe.gsuite.user(email);
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
  },

  // Drive endpoints
  // Copy a Drive file
  {
    block: async (context) => ({
      opcode: "copyDriveFile",
      blockType: "command",
      text: "copy Google Drive file [sourceFileId] to folder [destFolderId] with name [name]",
      arguments: {
        sourceFileId: {
          type: "string",
          defaultValue: "",
        },
        destFolderId: {
          type: "string",
          defaultValue: "",
        },
        name: {
          type: "string",
          defaultValue: "Copy",
        },
      },
    }),
    handler: async (context) => {
      const universe = getUniverse();
      if (!universe || !universe.gsuite || !context.userEmail) {
        throw new Error(
          "Google Workspace not connected or user not authenticated"
        );
      }

      const { sourceFileId, destFolderId, name } = context.validatedBody || {};
      if (!sourceFileId || !destFolderId || !name) {
        throw new Error("sourceFileId, destFolderId, and name are required");
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
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
  },
];
