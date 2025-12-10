import { ScratchEndpointDefinition } from "../../core";
import { UniverseModule } from "../../core";
import { S2 } from "../../s2";

export const readFromStream: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "readFromStream",
    blockType: "reporter",
    text: "read from stream [streamName] limit [limit]",
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
    const { streamName, limit } = context.validatedBody!;
    const basinName = S2.getBasin();
    const limitNum = parseInt(limit || "10", 10) || 10;
    const result = await context.universe!.s2!.readFromStream(
      basinName,
      streamName,
      limitNum
    );
    return result.records;
  },
  requiredModules: [UniverseModule.S2],
};

