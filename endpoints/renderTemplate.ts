import { ScratchEndpointDefinition } from "../src";
import Mustache from "mustache";

export const renderTemplate: ScratchEndpointDefinition = {
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
    const { template, data } = context.inputs!;
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
};
