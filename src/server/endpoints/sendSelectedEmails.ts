import { ScratchEndpointDefinition } from "../../core";
import { UniverseModule } from "../../core";

export const sendSelectedEmails: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "sendSelectedEmails",
    blockType: "command",
    text: "send selected queued emails [ids]",
    schema: {
      ids: {
        type: "json",
        schema: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        description: "Array of email IDs to send",
      },
    },
  }),
  handler: async (context) => {
    const { ids } = context.validatedBody!;
    // ids is already parsed and validated as a non-empty array by the middleware
    return await context.universe!.emailQueue.send(ids);
  },
  requiredModules: [UniverseModule.EmailQueue],
};

