import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const getEmailQueue: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getEmailQueue",
    blockType: "reporter",
    text: "queued emails",
  }),
  handler: async (context) => {
    return context.universe!.emailQueue.getAll();
  },
  requiredModules: [UniverseModule.EmailQueue],
};
