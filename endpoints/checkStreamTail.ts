import { ScratchEndpointDefinition, UniverseModule, S2 } from "../src";

export const checkStreamTail: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "checkStreamTail",
    blockType: "reporter",
    text: "check tail of stream [streamName] limit [limit]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream",
      },
      limit: {
        type: "string",
        default: "5",
        description: "Maximum number of latest records to retrieve",
      },
    },
  }),
  handler: async (context) => {
    const { streamName, limit } = context.inputs!;
    const basinName = S2.getBasin();
    const limitNum = parseInt(limit || "5", 10) || 5;
    const result = await context.universe!.s2!.checkStreamTail(
      basinName,
      streamName,
      limitNum
    );
    return result.records;
  },
  requiredModules: [UniverseModule.S2],
};
