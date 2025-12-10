import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const sendAllEmails: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "sendAllEmails",
    blockType: "command",
    text: "send all queued emails",
  }),
  handler: async (context) => {
    return await context.universe!.emailQueue.send(null);
  },
  requiredModules: [UniverseModule.EmailQueue],
};
