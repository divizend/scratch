import {
  ScratchEndpointDefinition,
  UniverseModule,
  openDocument,
} from "@divizend/scratch-core";

export const getDocAsMarkdown: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getDocAsMarkdown",
    blockType: "reporter",
    text: "Google Doc to Markdown from [documentId]",
    schema: {
      documentId: {
        type: "string",
        default:
          "https://docs.google.com/document/d/1f3fEhar6zNiuf61QG7wuRug9alZRsOafcPSHPbgivDE/edit",
        description: "Google Docs document ID or URL",
      },
    },
  }),
  handler: async (context) => {
    const { documentId } = context.inputs!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const doc = await openDocument(gsuiteUser, documentId);
    const markdown = await doc.toMarkdown();
    // Return as JSON-encoded string to preserve newlines
    return JSON.stringify(markdown);
  },
  requiredModules: [UniverseModule.GSuite],
};
