import { ScratchEndpointDefinition } from "../src";
import { JSONPath } from "jsonpath-plus";

export const extractWithJSONPath: ScratchEndpointDefinition = {
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
};
