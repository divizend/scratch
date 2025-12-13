import { ScratchEndpointDefinition, UniverseModule } from "@divizend/scratch-core";

export const listGmailMessages: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "listGmailMessages",
    blockType: "reporter",
    text: "Gmail messages with label [label] limit [limit] for user [userEmail]",
    schema: {
      label: {
        type: "string",
        default: "INBOX",
        description: "Gmail label to filter messages",
      },
      limit: {
        type: "string",
        default: "10",
        description: "Maximum number of messages to retrieve",
      },
      userEmail: {
        type: "string",
        default: context.userEmail ?? "",
        description: "Gmail user email address",
      },
    },
  }),
  handler: async (context) => {
    const { label, limit, userEmail } = context.inputs!;
    const email = userEmail;

    try {
      const gsuiteUser = context.universe!.gsuite.user(email);
      const gmail = gsuiteUser.gmail();
      const limitNum = parseInt(limit || "10", 10) || 10;
      const labelFilter = label && label.trim() ? label.trim() : undefined;

      const messages: any[] = [];
      let count = 0;
      for await (const message of gmail.listMessages(labelFilter, {
        limit: limitNum,
        full: true,
      })) {
        messages.push({
          id: message.message.id,
          threadId: message.message.threadId,
          snippet: message.message.snippet,
        });
        count++;
        if (count >= limitNum) break;
      }
      return messages;
    } catch (error) {
      return [];
    }
  },
  requiredModules: [UniverseModule.GSuite],
};
