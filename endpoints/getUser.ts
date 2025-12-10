import { ScratchEndpointDefinition } from "../src";

export const getUser: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getUser",
    blockType: "reporter",
    text: "current user email",
  }),
  handler: async (context) => {
    return context.userEmail || "Unknown";
  },
};
