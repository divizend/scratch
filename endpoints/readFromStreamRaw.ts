import { ScratchEndpointDefinition, UniverseModule, S2 } from "@divizend/scratch-core";

export const readFromStreamRaw: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "readFromStreamRaw",
    blockType: "reporter",
    text: "read raw from stream [streamName] limit [limit]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream",
      },
      limit: {
        type: "string",
        default: "10",
        description: "Maximum number of records to read",
      },
    },
  }),
  handler: async (context) => {
    const { streamName, limit } = context.inputs!;
    const basinName = S2.getBasin();
    const limitNum = parseInt(limit || "10", 10) || 10;
    const result = await context.universe!.s2!.readFromStreamRaw(
      basinName,
      streamName,
      limitNum
    );
    return result.records;
  },
  requiredModules: [UniverseModule.S2],
};
