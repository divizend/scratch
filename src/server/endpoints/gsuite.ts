import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";
import { extractFileId } from "../../gsuite/utils";

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
          description: "Source Google Drive file ID or URL",
        },
        destFolderId: {
          type: "string",
          default: "",
          description: "Destination folder ID or URL",
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
        // Extract file IDs from URLs if needed
        const extractedSourceId = extractFileId(sourceFileId);
        const extractedDestId = extractFileId(destFolderId);

        const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
        const drive = gsuiteUser.drive();
        const newFile = await drive.copyFile({
          sourceFileId: extractedSourceId,
          destFolderId: extractedDestId,
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

  // Documents endpoints
  // Get Google Doc as HTML
  {
    block: async (context) => ({
      opcode: "getDocAsHTML",
      blockType: "reporter",
      text: "Google Doc as HTML from [documentId]",
      schema: {
        documentId: {
          type: "string",
          default: "",
          description: "Google Docs document ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { documentId } = context.validatedBody!;

      try {
        // Extract file ID from URL if needed
        const extractedId = extractFileId(documentId);

        const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
        const documents = gsuiteUser.documents();
        const doc = await documents.open(extractedId);
        const html = await doc.toHTML();
        return html;
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to get document as HTML"
        );
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Spreadsheets endpoints
  // Get all values from column A of a spreadsheet
  {
    block: async (context) => ({
      opcode: "getSpreadsheetColumnA",
      blockType: "reporter",
      text: "all values from column A in spreadsheet [spreadsheetId]",
      schema: {
        spreadsheetId: {
          type: "string",
          default: "",
          description: "Google Sheets spreadsheet ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { spreadsheetId } = context.validatedBody!;

      try {
        // Extract file ID from URL if needed
        const extractedId = extractFileId(spreadsheetId);

        const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
        const spreadsheets = gsuiteUser.spreadsheets();
        const spreadsheet = await spreadsheets.open(extractedId);

        // Get the first sheet (or default sheet)
        const firstSheet = spreadsheet.sheets[0];
        if (!firstSheet) {
          throw new Error("Spreadsheet has no sheets");
        }

        // Get all values from column A
        const columnValues = await firstSheet.getColumn("A");

        // Extract the values array from SheetValues
        // Since values is private, we'll use the API directly
        const valuesResponse =
          await spreadsheets.sheets.spreadsheets.values.get({
            spreadsheetId: extractedId,
            range: `${firstSheet.name}!A:A`,
          });

        const values = valuesResponse.data.values || [];

        // Flatten the 2D array to 1D array (each row in column A becomes one element)
        return values
          .map((row) => (row && row[0] ? row[0] : ""))
          .filter((val) => val !== "");
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to get spreadsheet column A values"
        );
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Get value from cell A1
  {
    block: async (context) => ({
      opcode: "getSpreadsheetCellA1",
      blockType: "reporter",
      text: "value from cell A1 in spreadsheet [spreadsheetId]",
      schema: {
        spreadsheetId: {
          type: "string",
          default: "",
          description: "Google Sheets spreadsheet ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { spreadsheetId } = context.validatedBody!;

      try {
        // Extract file ID from URL if needed
        const extractedId = extractFileId(spreadsheetId);

        const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
        const spreadsheets = gsuiteUser.spreadsheets();
        const spreadsheet = await spreadsheets.open(extractedId);

        // Get the first sheet (or default sheet)
        const firstSheet = spreadsheet.sheets[0];
        if (!firstSheet) {
          throw new Error("Spreadsheet has no sheets");
        }

        // Get value from cell A1
        const valuesResponse =
          await spreadsheets.sheets.spreadsheets.values.get({
            spreadsheetId: extractedId,
            range: `${firstSheet.name}!A1`,
          });

        const values = valuesResponse.data.values;

        // Return the value from A1 as a string, or empty string if cell is empty
        if (values && values.length > 0 && values[0] && values[0][0]) {
          return String(values[0][0]);
        }

        return "";
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to get spreadsheet cell A1 value"
        );
      }
    },
    requiredModules: [UniverseModule.GSuite],
  },
];
