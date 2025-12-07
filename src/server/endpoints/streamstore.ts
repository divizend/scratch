import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";
import { S2 } from "../../s2";

// Streamstore endpoints
export const streamstoreEndpoints: ScratchEndpointDefinition[] = [
  // Create stream
  {
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
      const { streamName } = context.validatedBody!;
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
  },

  // Append data to stream
  {
    block: async (context) => ({
      opcode: "appendToStream",
      blockType: "command",
      text: "append to stream [streamName] event type [eventType] data [data]",
      schema: {
        streamName: {
          type: "string",
          default: "scratch-demo",
          description: "Name of the stream",
        },
        eventType: {
          type: "string",
          default: "com.s2.streamstore.message",
          description: "CloudEvent type (e.g., com.example.event)",
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
      const { streamName, eventType, data } = context.validatedBody!;
      const basinName = S2.getBasin();
      await context.universe!.s2!.appendToStream(
        basinName,
        streamName,
        data,
        eventType
      );
      return {
        success: true,
        message: `Data appended to stream ${streamName} in basin ${basinName}`,
      };
    },
    requiredModules: [UniverseModule.S2],
  },

  // Read from stream
  {
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
  },

  // Check tail (get latest records)
  {
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
      const { streamName, limit } = context.validatedBody!;
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
  },

  // Read from stream (raw CloudEvents)
  {
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
      const { streamName, limit } = context.validatedBody!;
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
  },

  // Check tail (get latest records, raw CloudEvents)
  {
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
      const result = await context.universe!.s2!.checkStreamTailRaw(
        basinName,
        streamName,
        limitNum
      );
      return result.records;
    },
    requiredModules: [UniverseModule.S2],
  },
];
