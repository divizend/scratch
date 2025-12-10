import { ScratchEndpointDefinition } from "../src";

export const registerEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "registerEndpoint",
    blockType: "command",
    text: "register endpoint from TypeScript source [source]",
    schema: {
      source: {
        type: "string",
        default: `import { ScratchEndpointDefinition } from "../src";

export const myEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "myEndpoint",
    blockType: "command",
    text: "my endpoint",
  }),
  handler: async (context) => {
    return { success: true };
  },
};`,
        description: "TypeScript source code for the endpoint",
      },
    },
  }),
  handler: async (context) => {
    const { source } = context.inputs!;
    return await context.universe!.httpServer.registerEndpoint(source);
  },
};
