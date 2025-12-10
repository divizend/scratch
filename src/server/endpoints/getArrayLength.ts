import { ScratchEndpointDefinition } from "../../core";

export const getArrayLength: ScratchEndpointDefinition = {
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
};
