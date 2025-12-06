import { ScratchEndpointDefinition } from "../scratch";
import { Universe, Resend } from "../../";
import { signJwtToken } from "../auth";

let universe: Universe | null = null;

export function setUniverse(u: Universe | null) {
  universe = u;
}

// Core and authentication endpoints
export const coreEndpoints: ScratchEndpointDefinition[] = [
  // Get available domains (public, for JWT sending)
  {
    block: async (context) => ({
      opcode: "getDomains",
      blockType: "reporter",
      text: "workspace domains",
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
  },

  // Send JWT token via email
  {
    block: async (context) => ({
      opcode: "sendJwt",
      blockType: "command",
      text: "send login token to [email]",
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
  },

  // Get current user email
  {
    block: async (context) => ({
      opcode: "getUser",
      blockType: "reporter",
      text: "my email",
      arguments: {},
    }),
    handler: async (context) => {
      return { email: context.userEmail || "Unknown" };
    },
  },

  // Health check for googleapis connection
  {
    block: async (context) => ({
      opcode: "getHealth",
      blockType: "reporter",
      text: "workspace status",
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
  },

  // GSuite Admin endpoints
  // Get all users in the organization
  {
    block: async (context) => ({
      opcode: "getUsers",
      blockType: "reporter",
      text: "workspace users",
      arguments: {},
    }),
    handler: async (context) => {
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
      text: "my email labels",
      arguments: {},
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        return [];
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
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
      text: "my emails [label] [limit]",
      arguments: {
        label: {
          type: "string",
          defaultValue: "",
        },
        limit: {
          type: "string",
          defaultValue: "10",
        },
      },
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        return [];
      }

      try {
        const { label, limit } = context.validatedBody || {};
        const gsuiteUser = universe.gsuite.user(context.userEmail);
        const gmail = gsuiteUser.gmail();
        const limitNum = parseInt(limit || "10", 10) || 10;
        const labelFilter = label && label.trim() ? label.trim() : undefined;

        const messages: any[] = [];
        let count = 0;
        for await (const message of gmail.listMessages(labelFilter, {
          limit: limitNum,
          full: false,
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

  // Send Gmail message
  {
    block: async (context) => ({
      opcode: "sendGmail",
      blockType: "command",
      text: "send email [to] [subject] [body]",
      arguments: {
        to: {
          type: "string",
          defaultValue: context.userEmail ?? "",
        },
        subject: {
          type: "string",
          defaultValue: "Hello from Scratch!",
        },
        body: {
          type: "string",
          defaultValue: "This email was sent from a Scratch block.",
        },
      },
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        throw new Error(
          "Google Workspace not connected or user not authenticated"
        );
      }

      const { to, subject, body } = context.validatedBody || {};
      if (!to || !subject || !body) {
        throw new Error("to, subject, and body are required");
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
        const gmail = gsuiteUser.gmail();
        await gmail.send({ to, subject, body });
        return { success: true, message: "Gmail sent successfully" };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to send Gmail"
        );
      }
    },
  },

  // Drive endpoints
  // Open a Drive file
  {
    block: async (context) => ({
      opcode: "openDriveFile",
      blockType: "reporter",
      text: "open file [fileId]",
      arguments: {
        fileId: {
          type: "string",
          defaultValue: "",
        },
      },
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        throw new Error(
          "Google Workspace not connected or user not authenticated"
        );
      }

      const { fileId } = context.validatedBody || {};
      if (!fileId) {
        throw new Error("fileId is required");
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
        const drive = gsuiteUser.drive();
        const file = await drive.open(fileId);
        return {
          id: file.id,
          name: file.file.name || "",
          mimeType: file.file.mimeType || "",
        };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to open Drive file"
        );
      }
    },
  },

  // Copy a Drive file
  {
    block: async (context) => ({
      opcode: "copyDriveFile",
      blockType: "command",
      text: "copy file [sourceFileId] to [destFolderId] as [name]",
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

  // Documents endpoints
  // Open a Google Doc
  {
    block: async (context) => ({
      opcode: "openDocument",
      blockType: "reporter",
      text: "open doc [documentId]",
      arguments: {
        documentId: {
          type: "string",
          defaultValue: "",
        },
      },
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        throw new Error(
          "Google Workspace not connected or user not authenticated"
        );
      }

      const { documentId } = context.validatedBody || {};
      if (!documentId) {
        throw new Error("documentId is required");
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
        const documents = gsuiteUser.documents();
        const document = await documents.open(documentId);
        return {
          id: document.id,
          title: document.document.title || "",
        };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to open document"
        );
      }
    },
  },

  // Spreadsheets endpoints
  // Open a Google Sheet
  {
    block: async (context) => ({
      opcode: "openSpreadsheet",
      blockType: "reporter",
      text: "open sheet [spreadsheetId]",
      arguments: {
        spreadsheetId: {
          type: "string",
          defaultValue: "",
        },
      },
    }),
    handler: async (context) => {
      if (!universe || !universe.gsuite || !context.userEmail) {
        throw new Error(
          "Google Workspace not connected or user not authenticated"
        );
      }

      const { spreadsheetId } = context.validatedBody || {};
      if (!spreadsheetId) {
        throw new Error("spreadsheetId is required");
      }

      try {
        const gsuiteUser = universe.gsuite.user(context.userEmail);
        const spreadsheets = gsuiteUser.spreadsheets();
        const spreadsheet = await spreadsheets.open(spreadsheetId);
        // Fetch full spreadsheet metadata to get title
        const metadata = await spreadsheets.sheets.spreadsheets.get({
          spreadsheetId: spreadsheet.id,
          fields: "properties.title",
        });
        return {
          id: spreadsheet.id,
          title: metadata.data.properties?.title || "",
        };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to open spreadsheet"
        );
      }
    },
  },
];
