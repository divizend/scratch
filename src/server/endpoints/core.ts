import { ScratchEndpointDefinition } from "../scratch";
import { signJwtToken } from "../auth";
import { UniverseModule } from "../../core";
import Mustache from "mustache";
import { JSONPath } from "jsonpath-plus";

// Core and authentication endpoints
export const coreEndpoints: ScratchEndpointDefinition[] = [
  // Get available domains (public, for JWT sending)
  {
    block: async (context) => ({
      opcode: "getDomains",
      blockType: "reporter",
      text: "available email domains",
    }),
    handler: async (context) => {
      try {
        const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
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
    requiredModules: [UniverseModule.GSuite],
  },

  // Send JWT token via email
  {
    block: async (context) => ({
      opcode: "sendJwt",
      blockType: "command",
      text: "send access token to [email]",
      schema: {
        email: {
          type: "string",
          default: context.userEmail ?? "",
          description: "Email address to send JWT token to",
        },
      },
    }),
    handler: async (context) => {
      const { email } = context.validatedBody!;

      // Validate email domain
      const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
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
      const response = await context.universe!.resend!.sendEmail({
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
    requiredModules: [UniverseModule.GSuite, UniverseModule.Resend],
  },

  // Get current user email
  {
    block: async (context) => ({
      opcode: "getUser",
      blockType: "reporter",
      text: "current user email",
    }),
    handler: async (context) => {
      return context.userEmail || "Unknown";
    },
  },

  // Health check for googleapis connection
  {
    block: async (context) => ({
      opcode: "getHealth",
      blockType: "reporter",
      text: "Google Workspace connection status",
    }),
    handler: async (context) => {
      try {
        const orgConfigs = (context.universe!.gsuite as any).orgConfigs;
        if (!orgConfigs || Object.keys(orgConfigs).length === 0) {
          return {
            status: "error",
            message: "No GSuite organizations configured",
            connected: false,
          };
        }

        const firstOrg = Object.keys(orgConfigs)[0];
        const orgConfig = orgConfigs[firstOrg];
        const gsuiteUser = context.universe!.gsuite.user(orgConfig.adminUser);
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
    requiredModules: [UniverseModule.GSuite],
  },

  // Template rendering
  {
    block: async (context) => ({
      opcode: "renderTemplate",
      blockType: "reporter",
      text: "render template [template] with data [data]",
      schema: {
        template: {
          type: "string",
          default: "Hello, {{name}}!",
          description: "Mustache template string",
        },
        data: {
          type: "string",
          default: '{"name": "World"}',
          description: "JSON object with template data",
        },
      },
    }),
    handler: async (context) => {
      const { template, data } = context.validatedBody!;

      try {
        // Parse the data JSON string
        let parsedData: any;
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON data: ${
              parseError instanceof Error ? parseError.message : "Unknown error"
            }`
          );
        }

        // Render the template using Mustache
        const rendered = Mustache.render(template, parsedData);
        return rendered;
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to render template"
        );
      }
    },
  },

  // JSONPath extraction
  {
    block: async (context) => ({
      opcode: "extractWithJSONPath",
      blockType: "reporter",
      text: "extract from JSON [json] using JSONPath [path]",
      schema: {
        json: {
          type: "string",
          default: '{"name": "John", "age": 30}',
          description: "JSON string to extract from",
        },
        path: {
          type: "string",
          default: "$.name",
          description: "JSONPath expression",
        },
      },
    }),
    handler: async (context) => {
      const { json, path } = context.validatedBody!;

      try {
        // Parse the JSON string
        let parsedJson: any;
        try {
          parsedJson = JSON.parse(json);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON: ${
              parseError instanceof Error ? parseError.message : "Unknown error"
            }`
          );
        }

        // Apply JSONPath expression
        const results = JSONPath({ path, json: parsedJson });

        // Return results as string
        // If single result, return it directly (stringified if needed)
        // If multiple results, return as JSON array string
        if (results.length === 0) {
          return "";
        } else if (results.length === 1) {
          const result = results[0];
          // If it's a primitive, return as string; otherwise stringify
          if (
            typeof result === "string" ||
            typeof result === "number" ||
            typeof result === "boolean" ||
            result === null
          ) {
            return String(result);
          }
          return JSON.stringify(result);
        } else {
          // Multiple results - return as JSON array string
          return JSON.stringify(results);
        }
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to extract with JSONPath"
        );
      }
    },
  },

  // Get array length
  {
    block: async (context) => ({
      opcode: "getArrayLength",
      blockType: "reporter",
      text: "length of array [array]",
      schema: {
        array: {
          type: "string",
          default: "[]",
          description: "JSON array string",
        },
      },
    }),
    handler: async (context) => {
      const { array } = context.validatedBody!;

      try {
        // Parse the array JSON string
        let parsedArray: any;
        try {
          parsedArray = JSON.parse(array);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON array: ${
              parseError instanceof Error ? parseError.message : "Unknown error"
            }`
          );
        }

        // Check if it's actually an array
        if (!Array.isArray(parsedArray)) {
          throw new Error("Input is not an array");
        }

        // Return the length as a stringified number
        return String(parsedArray.length);
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Failed to get array length"
        );
      }
    },
  },
];
