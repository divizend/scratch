import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";
import {
  extractFileId,
  openDocument,
  openSpreadsheetFirstSheet,
} from "../../gsuite/utils";

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
  // Get Google Doc to HTML
  {
    block: async (context) => ({
      opcode: "getDocAsHTML",
      blockType: "reporter",
      text: "Google Doc to HTML from [documentId]",
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
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const doc = await openDocument(gsuiteUser, documentId);
      return doc.toHTML();
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Get Google Doc to plaintext
  {
    block: async (context) => ({
      opcode: "getDocAsPlainText",
      blockType: "reporter",
      text: "Google Doc to plaintext from [documentId]",
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
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const doc = await openDocument(gsuiteUser, documentId);
      return doc.toPlainText();
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Spreadsheets endpoints
  // Get all values from a column of a spreadsheet
  {
    block: async (context) => ({
      opcode: "getSpreadsheetColumn",
      blockType: "reporter",
      text: "all values from column [column] in spreadsheet [spreadsheetId]",
      schema: {
        column: {
          type: "string",
          default: "A",
          description: "Column letter (e.g., A, B, C)",
        },
        spreadsheetId: {
          type: "string",
          default: "",
          description: "Google Sheets spreadsheet ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { column, spreadsheetId } = context.validatedBody!;
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const { spreadsheet, sheet, spreadsheets } =
        await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
      const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheet.id,
        range: `${sheet.name}!${column}:${column}`,
      });
      const values = valuesResponse.data.values || [];
      return values
        .map((row) => (row && row[0] ? row[0] : ""))
        .filter((val) => val !== "");
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Get all values from a row of a spreadsheet
  {
    block: async (context) => ({
      opcode: "getSpreadsheetRow",
      blockType: "reporter",
      text: "all values from row [row] in spreadsheet [spreadsheetId]",
      schema: {
        row: {
          type: "string",
          default: "1",
          description: "Row number (e.g., 1, 2, 3)",
        },
        spreadsheetId: {
          type: "string",
          default: "",
          description: "Google Sheets spreadsheet ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { row, spreadsheetId } = context.validatedBody!;
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const { spreadsheet, sheet, spreadsheets } =
        await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
      const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheet.id,
        range: `${sheet.name}!${row}:${row}`,
      });
      const values = valuesResponse.data.values || [];
      return (values[0] || [])
        .map((val) => (val ? String(val) : ""))
        .filter((val) => val !== "");
    },
    requiredModules: [UniverseModule.GSuite],
  },

  // Get value from a cell
  {
    block: async (context) => ({
      opcode: "getSpreadsheetCell",
      blockType: "reporter",
      text: "value from cell [cell] in spreadsheet [spreadsheetId]",
      schema: {
        cell: {
          type: "string",
          default: "A1",
          description: "Cell reference (e.g., A1, B2, C3)",
        },
        spreadsheetId: {
          type: "string",
          default: "",
          description: "Google Sheets spreadsheet ID or URL",
        },
      },
    }),
    handler: async (context) => {
      const { cell, spreadsheetId } = context.validatedBody!;
      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const { spreadsheet, sheet, spreadsheets } =
        await openSpreadsheetFirstSheet(gsuiteUser, spreadsheetId);
      const valuesResponse = await spreadsheets.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheet.id,
        range: `${sheet.name}!${cell}`,
      });
      const values = valuesResponse.data.values;
      if (values && values.length > 0 && values[0] && values[0][0]) {
        return String(values[0][0]);
      }
      return "";
    },
    requiredModules: [UniverseModule.GSuite],
  },
];
