import { ScratchEndpointDefinition, UniverseModule, S2 } from "@divizend/scratch-core";

export const createStream: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "createStream",
    blockType: "command",
    text: "create stream [streamName]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream to create",
      },
    },
  }),
  handler: async (context) => {
    const { streamName } = context.inputs!;
    const basinName = S2.getBasin();
    const result = await context.universe!.s2!.createStream(
      basinName,
      streamName
    );
    return {
      success: true,
      created: result.created,
      message: result.message,
    };
  },
  requiredModules: [UniverseModule.S2],
};
