import { ScratchEndpointDefinition } from "../../core";
import { UniverseModule } from "../../core";
import { openDocument } from "../../gsuite/utils";

export const getDocAsPlainText: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "getDocAsPlainText",
    blockType: "reporter",
    text: "Google Doc to plaintext from [documentId]",
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
    return doc.toPlainText();
  },
  requiredModules: [UniverseModule.GSuite],
};

