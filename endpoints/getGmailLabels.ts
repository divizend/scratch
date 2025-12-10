import { ScratchEndpointDefinition, UniverseModule } from "../src";

export const getGmailLabels: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getGmailLabels",
    blockType: "reporter",
    text: "Gmail labels for user [userEmail]",
    schema: {
      userEmail: {
        type: "string",
        default: context.userEmail ?? "",
        description: "Gmail user email address",
      },
    },
  }),
  handler: async (context) => {
    const { userEmail } = context.validatedBody!;
    const email = userEmail;

    try {
      const gsuiteUser = context.universe!.gsuite.user(email);
      const gmail = gsuiteUser.gmail();
      const labels = await gmail.getLabels();
      return labels.map((label) => ({
        id: label.id,
        name: label.name,
      }));
    } catch (error) {
      return [];
    }
  },
  requiredModules: [UniverseModule.GSuite],
};
