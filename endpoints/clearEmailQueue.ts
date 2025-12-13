import { ScratchEndpointDefinition, UniverseModule } from "@divizend/scratch-core";

export const clearEmailQueue: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "clearEmailQueue",
    blockType: "command",
    text: "clear all queued emails",
  }),
  handler: async (context) => {
    context.universe!.emailQueue.clear();
    return { success: true, message: "Email queue cleared" };
  },
  requiredModules: [UniverseModule.EmailQueue],
};
