import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const getHealth: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getHealth",
    blockType: "reporter",
    text: "system health status",
  }),
  handler: async (context) => {
    return await context.universe!.getHealth();
  },
  requiredModules: [UniverseModule.GSuite],
};
