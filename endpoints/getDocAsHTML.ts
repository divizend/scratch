import {
  ScratchEndpointDefinition,
  UniverseModule,
  openDocument,
} from "../src";

export const getDocAsHTML: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getDocAsHTML",
    blockType: "reporter",
    text: "Google Doc to HTML from [documentId]",
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
    const { documentId } = context.validatedBody!;
    const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
    const doc = await openDocument(gsuiteUser, documentId);
    return doc.toHTML();
  },
  requiredModules: [UniverseModule.GSuite],
};
