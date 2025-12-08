import { ScratchBlock } from "./scratch";
import { envOrDefault } from "../core/Env";

// Generate extension ID and name from hyphenated name
export function generateExtensionInfo() {
  const orgName = envOrDefault(undefined, "ORG_NAME", "divizend");
  const orgNamePascal = orgName.charAt(0).toUpperCase() + orgName.slice(1);

  return {
    id: `${orgNamePascal}`,
    displayName: `${orgNamePascal}`,
  };
}

// Determine the base URL for the extension based on whether we're running locally
export function getBaseUrl(c: any): string {
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
export function generateDefaultFromSchema(jsonSchema: any): any {
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
export function generateArgumentsFromSchema(schema?: ScratchBlock["schema"]): {
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
