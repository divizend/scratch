import { Hono } from "hono";
import { validateJwtToken } from "./auth";
import { scratchEndpoints, ScratchContext, ScratchBlock } from "./scratch";
import { envOrDefault } from "../core/Env";

// Helper function to convert email to hyphenated name (e.g., "julian.nalenz@divizend.com" -> "julian-nalenz")
function emailToHyphenatedName(email: string): string {
  const localPart = email.split("@")[0];
  return localPart.replace(/\./g, "-");
}

// Helper function to convert hyphenated string to PascalCase
function hyphenatedToPascalCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// Helper function to convert hyphenated string to Title Case
function toTitleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Generate extension ID and name from hyphenated name
function generateExtensionInfo() {
  const orgName = envOrDefault(undefined, "ORG_NAME", "divizend");
  const orgNamePascal = orgName.charAt(0).toUpperCase() + orgName.slice(1);

  return {
    id: `${orgNamePascal}`,
    displayName: `${orgNamePascal}`,
  };
}

// Determine the base URL for the extension based on whether we're running locally
function getBaseUrl(c: any): string {
  const host = c.req.header("host") || "";
  const port = envOrDefault(undefined, "PORT", "3000");
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("::1") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  if (isLocal) {
    return `http://localhost:${port}`;
  }

  const HOSTED_AT = envOrDefault(undefined, "HOSTED_AT", "scratch.divizend.ai");
  // Use HOSTED_AT, ensuring it has a protocol
  const hostedAt = HOSTED_AT.startsWith("http")
    ? HOSTED_AT
    : `https://${HOSTED_AT}`;
  return hostedAt;
}

// Helper function to generate default value from JSON schema (same as in scratch.ts)
function generateDefaultFromSchema(jsonSchema: any): any {
  if (jsonSchema.default !== undefined) {
    return jsonSchema.default;
  }

  switch (jsonSchema.type) {
    case "object":
      const obj: any = {};
      if (jsonSchema.properties) {
        for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
          obj[key] = generateDefaultFromSchema(propSchema as any);
        }
      }
      return obj;
    case "array":
      return [];
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return null;
  }
}

// Helper function to generate Scratch arguments from schema properties (same as in scratch.ts)
function generateArgumentsFromSchema(schema?: ScratchBlock["schema"]): {
  [key: string]: {
    type: "string" | "number" | "boolean";
    defaultValue?: string | number | boolean;
  };
} {
  const arguments_: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      defaultValue?: string | number | boolean;
    };
  } = {};

  if (schema) {
    for (const [key, propSchema] of Object.entries(schema)) {
      // Map JSON schema types to Scratch argument types
      let scratchType: "string" | "number" | "boolean" = "string";
      let defaultValue: any = propSchema.default;

      if (propSchema.type === "number") {
        scratchType = "number";
      } else if (propSchema.type === "boolean") {
        scratchType = "boolean";
      } else if (propSchema.type === "array" || propSchema.type === "object") {
        // Arrays and objects are represented as strings in Scratch (JSON strings)
        scratchType = "string";
        if (defaultValue === undefined) {
          defaultValue = propSchema.type === "array" ? "[]" : "{}";
        } else if (typeof defaultValue !== "string") {
          defaultValue = JSON.stringify(defaultValue);
        }
      } else if (propSchema.type === "json") {
        // JSON type is always a string in Scratch (JSON string)
        scratchType = "string";
        // Generate default from the JSON schema if not provided
        if (defaultValue === undefined && propSchema.schema) {
          const generatedDefault = generateDefaultFromSchema(propSchema.schema);
          defaultValue = JSON.stringify(generatedDefault);
        } else if (
          defaultValue !== undefined &&
          typeof defaultValue !== "string"
        ) {
          defaultValue = JSON.stringify(defaultValue);
        }
      }

      arguments_[key] = {
        type: scratchType,
        defaultValue,
      };
    }
  }

  return arguments_;
}

// Register extension source endpoint
export function registerExtensionEndpoint(app: Hono) {
  app.get("*", async (c, next) => {
    const path = c.req.path;

    // Only handle paths that match /extension/{jwt}.js pattern (not admin, api, etc.)
    // JWT tokens contain base64url characters: a-z, A-Z, 0-9, -, _, and dots
    const match = path.match(/^\/extension\/([A-Za-z0-9\-_\.]+)\.js$/);

    if (!match) {
      return next();
    }

    const jwtToken = match[1];

    // Validate JWT token
    const payload = await validateJwtToken(jwtToken);
    if (!payload) {
      return c.text("Invalid or expired JWT token", 401);
    }

    // Extract email from JWT payload
    const email = (payload as any)?.email;
    if (!email || typeof email !== "string") {
      return c.text("JWT token does not contain a valid email address", 400);
    }

    // Generate extension ID and name from the email-derived name
    const { id: extensionId, displayName: extensionName } =
      generateExtensionInfo();

    // Determine the base URL for this request
    const baseUrl = getBaseUrl(c);

    // Create context with user email
    const context: ScratchContext = { userEmail: email };

    // Generate the Scratch extension class
    // Resolve dynamic blocks using the context
    const resolvedEndpoints = await Promise.all(
      scratchEndpoints.map(async (ep) => {
        // Call block function with context to get resolved block (await since it returns a Promise)
        const block = await ep.block(context);
        return { ...ep, block };
      })
    );

    const blocks = resolvedEndpoints.map((ep) => {
      // Generate arguments from schema for Scratch extension
      const args = generateArgumentsFromSchema(ep.block.schema);
      return { ...ep.block, arguments: args };
    });
    const methods = resolvedEndpoints
      .map((ep) => {
        const params = Object.keys(
          generateArgumentsFromSchema(ep.block.schema)
        );
        const paramList = params.join(", ");
        const isGet = ep.block.blockType === "reporter";

        let fetchCode = "";
        if (isGet) {
          // GET request with query parameters
          if (params.length > 0) {
            const queryParts = params.map(
              (p, idx) =>
                `"${idx === 0 ? "?" : "&"}${p}=" + encodeURIComponent(${p})`
            );
            fetchCode = `    return fetch("${baseUrl}${
              ep.endpoint
            }" + ${queryParts.join(" + ")}, {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
          } else {
            fetchCode = `    return fetch("${baseUrl}${ep.endpoint}", {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
          }
        } else {
          // POST request with body
          const fetchBody =
            params.length > 0
              ? `body: JSON.stringify({ ${params
                  .map((p) => `${p}`)
                  .join(", ")} })`
              : "";
          fetchCode = `    return fetch("${baseUrl}${ep.endpoint}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${jwtToken}",
      }${fetchBody ? `,\n      ${fetchBody}` : ""}
    }).then((response) => response.text());`;
        }

        return `  ${ep.opcode}({ ${paramList} }) {
${fetchCode}
  }`;
      })
      .join("\n\n");

    const extensionCode = `class ${extensionId} {
  constructor() {}

  getInfo() {
    return {
      id: "${extensionId}",
      name: "${extensionName}",
      blocks: ${JSON.stringify(blocks, null, 2)},
    };
  }

${methods}
}

Scratch.extensions.register(new ${extensionId}());`;

    return c.text(extensionCode, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  });
}
