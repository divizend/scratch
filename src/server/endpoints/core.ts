import { ScratchEndpointDefinition } from "../scratch";
import { getAllEndpointDefinitions } from "../endpoints";
import { signJwtToken } from "../auth";
import { UniverseModule } from "../../core";
import Mustache from "mustache";
import { JSONPath } from "jsonpath-plus";
import { marked } from "marked";

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

  // Health check for all services
  {
    block: async (context) => ({
      opcode: "getHealth",
      blockType: "reporter",
      text: "system health status",
    }),
    handler: async (context) => {
      return await context.universe!.getHealth();
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
          default:
            "🎉 Welcome, {{name}}! You have {{count}} new {{#isOne}}notification{{/isOne}}{{^isOne}}notifications{{/isOne}}. Your next meeting is at {{meetingTime}}.",
          description: "Mustache template string",
        },
        data: {
          type: "json",
          schema: {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
          default: JSON.stringify({
            name: "Alice",
            count: 1,
            isOne: true,
            meetingTime: "2:00 PM",
          }),
          description: "JSON object with template data",
        },
      },
    }),
    handler: async (context) => {
      const { template, data } = context.validatedBody!;
      // data is already parsed and validated by the middleware

      // Recursively convert "TRUE" to true and "FALSE" to false
      const normalizeBooleans = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return obj;
        }
        if (typeof obj === "string") {
          if (obj === "TRUE") return true;
          if (obj === "FALSE") return false;
          return obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(normalizeBooleans);
        }
        if (typeof obj === "object") {
          const normalized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            normalized[key] = normalizeBooleans(value);
          }
          return normalized;
        }
        return obj;
      };

      const normalizedData = normalizeBooleans(data);
      const rendered = Mustache.render(template, normalizedData);
      return rendered;
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
          type: "json",
          schema: {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
          default: JSON.stringify({
            users: [{ email: "alice@example.com" }],
          }),
          description: "JSON object to extract from",
        },
        path: {
          type: "string",
          default: "$.users[0].email",
          description: "JSONPath expression",
        },
      },
    }),
    handler: async (context) => {
      const { json, path } = context.validatedBody!;
      // json is already parsed and validated by the middleware
      const results = JSONPath({ path, json });

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
          type: "json",
          schema: {
            type: "array",
            items: {},
          },
          default: JSON.stringify([
            "🚀 Launch Project",
            "📧 Review Emails",
            "💡 Brainstorm Ideas",
            "✅ Complete Tasks",
            "🎯 Set Goals",
          ]),
          description: "JSON array",
        },
      },
    }),
    handler: async (context) => {
      const { array } = context.validatedBody!;
      // array is already parsed and validated as an array by the middleware
      return String(array.length);
    },
  },

  // Convert Markdown to HTML
  {
    block: async (context) => ({
      opcode: "markdownToHTML",
      blockType: "reporter",
      text: "Markdown to HTML from [markdown]",
      schema: {
        markdown: {
          type: "string",
          default: JSON.stringify(
            "# Hello World\n\nThis is a **markdown** example with a [link](https://example.com)."
          ),
          description: "JSON-stringified Markdown text to convert to HTML",
        },
      },
    }),
    handler: async (context) => {
      const { markdown } = context.validatedBody!;
      // Parse JSON-stringified markdown first
      let markdownText: string;
      try {
        markdownText = JSON.parse(markdown);
      } catch (error) {
        // If parsing fails, assume it's already plain markdown (backward compatibility)
        markdownText = markdown;
      }
      const html = await marked(markdownText);
      return html;
    },
  },

  // List all endpoints
  {
    block: async (context) => ({
      opcode: "listEndpoints",
      blockType: "reporter",
      text: "list all endpoints",
    }),
    handler: async (context) => {
      const endpointDefinitions = getAllEndpointDefinitions();

      // Resolve all block definitions
      const resolvedEndpoints = await Promise.all(
        endpointDefinitions.map(async (epDef) => {
          const blockDef = await epDef.block(context);
          const method = blockDef.blockType === "reporter" ? "GET" : "POST";
          const endpoint = `/api/${blockDef.opcode}`;

          return {
            method,
            path: endpoint,
            opcode: blockDef.opcode,
            blockType: blockDef.blockType,
            text: blockDef.text,
            schema: blockDef.schema,
            requiresAuth: !epDef.noAuth,
          };
        })
      );

      return {
        endpoints: resolvedEndpoints,
        total: resolvedEndpoints.length,
      };
    },
    noAuth: true,
  },
];
