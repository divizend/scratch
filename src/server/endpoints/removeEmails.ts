import { ScratchEndpointDefinition } from "../../core";
import { UniverseModule } from "../../core";

export const removeEmails: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "removeEmails",
    blockType: "command",
    text: "remove queued emails [ids]",
    schema: {
      ids: {
        type: "json",
        schema: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        description: "Array of email IDs to remove",
      },
    },
  }),
  handler: async (context) => {
    const { ids } = context.validatedBody!;
    // ids is already parsed and validated as a non-empty array by the middleware
    const removed = context.universe!.emailQueue.removeByIds(ids);
    return {
      success: true,
      removed,
      message: `Removed ${removed} email(s)`,
    };
  },
  requiredModules: [UniverseModule.EmailQueue],
};

