import { ScratchEndpointDefinition } from "../scratch";
import { UniverseModule } from "../../core";
import { S2 } from "../../s2";

// Streamstore endpoints
export const streamstoreEndpoints: ScratchEndpointDefinition[] = [
  // Append data to stream
  {
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
      const { streamName, data } = context.validatedBody!;
      const basinName = S2.getBasin();
      await context.universe!.s2!.appendToStream(basinName, streamName, data);
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

  // Read with session
  {
    block: async (context) => ({
      opcode: "readStreamSession",
      blockType: "reporter",
      text: "read from stream [streamName] with session [sessionId] limit [limit]",
      schema: {
        streamName: {
          type: "string",
          default: "scratch-demo",
          description: "Name of the stream",
        },
        sessionId: {
          type: "string",
          default: "",
          description: "Session ID for reading (empty for new session)",
        },
        limit: {
          type: "string",
          default: "10",
          description: "Maximum number of records to read",
        },
      },
    }),
    handler: async (context) => {
      const { streamName, sessionId, limit } = context.validatedBody!;
      const basinName = S2.getBasin();
      const limitNum = parseInt(limit || "10", 10) || 10;
      const result = await context.universe!.s2!.readStreamSession(
        basinName,
        streamName,
        sessionId || "",
        limitNum
      );
      return {
        records: result.records,
        sessionId: result.session,
      };
    },
    requiredModules: [UniverseModule.S2],
  },

  // Append with session
  {
    block: async (context) => ({
      opcode: "appendStreamSession",
      blockType: "command",
      text: "append to stream [streamName] with session [sessionId] data [data]",
      schema: {
        streamName: {
          type: "string",
          default: "scratch-demo",
          description: "Name of the stream",
        },
        sessionId: {
          type: "string",
          default: "",
          description: "Session ID for appending (empty for new session)",
        },
        data: {
          type: "json",
          schema: {
            type: "object",
            properties: {},
            additionalProperties: true,
          },
          default: JSON.stringify({
            event: "session_update",
            action: "data_logged",
            timestamp: new Date().toISOString(),
            session: {
              type: "interactive",
              source: "scratch-block-session",
            },
          }),
          description: "Data to append to the stream",
        },
      },
    }),
    handler: async (context) => {
      const { streamName, sessionId, data } = context.validatedBody!;
      const basinName = S2.getBasin();
      const result = await context.universe!.s2!.appendStreamSession(
        basinName,
        streamName,
        sessionId || "",
        data
      );
      return {
        success: true,
        sessionId: result.session,
        message: `Data appended to stream ${streamName} in basin ${basinName}${
          result.session ? ` with session ${result.session}` : ""
        }`,
      };
    },
    requiredModules: [UniverseModule.S2],
  },
];
