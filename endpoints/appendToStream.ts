import { ScratchEndpointDefinition, UniverseModule, S2 } from "../src";

export const appendToStream: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "appendToStream",
    blockType: "command",
    text: "append to stream [streamName] data [data]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream",
      },
      data: {
        type: "json",
        schema: {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        default: JSON.stringify({
          event: "user_action",
          action: "button_click",
          timestamp: new Date().toISOString(),
          metadata: {
            source: "scratch-block",
            version: "1.0",
          },
        }),
        description: "Data to append to the stream",
      },
    },
  }),
  handler: async (context) => {
    const { streamName, data } = context.inputs!;
    const basinName = S2.getBasin();
    await context.universe!.s2!.appendToStream(basinName, streamName, data);
    return {
      success: true,
      message: `Data appended to stream ${streamName} in basin ${basinName}`,
    };
  },
  requiredModules: [UniverseModule.S2],
};
