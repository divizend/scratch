import { ScratchEndpointDefinition, UniverseModule, S2 } from "../src";

export const checkStreamTailRaw: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "checkStreamTailRaw",
    blockType: "reporter",
    text: "check raw tail of stream [streamName] limit [limit]",
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
    const { streamName, limit } = context.validatedBody!;
    const basinName = S2.getBasin();
    const limitNum = parseInt(limit || "5", 10) || 5;
    try {
      const result = await context.universe!.s2!.checkStreamTailRaw(
        basinName,
        streamName,
        limitNum
      );
      return result.records;
    } catch (error: any) {
      // Check if it's a stream not found error
      const errorMessage =
        error?.message || error?.data$?.message || String(error);
      const status =
        error?.status || error?.statusCode || error?.response?.status;
      const code = error?.code || error?.data$?.code;

      if (
        status === 404 ||
        code === "stream_not_found" ||
        code === "not_found" ||
        errorMessage.includes("not found") ||
        errorMessage.includes("Stream not found")
      ) {
        // Return 404 response for non-existent streams
        return new Response(JSON.stringify({ error: "Stream not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Re-throw other errors to be handled by the generic error handler
      throw error;
    }
  },
  requiredModules: [UniverseModule.S2],
};
