import {
  ScratchEndpointDefinition,
  UniverseModule,
  extractFileId,
} from "../src";

export const copyDriveFile: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "copyDriveFile",
    blockType: "command",
    text: "copy Google Drive file [sourceFileId] to folder [destFolderId] with name [name]",
    schema: {
      sourceFileId: {
        type: "string",
        default: "",
        description: "Source Google Drive file ID or URL",
      },
      destFolderId: {
        type: "string",
        default: "",
        description: "Destination folder ID or URL",
      },
      name: {
        type: "string",
        default: "Copy",
        description: "Name for the copied file",
      },
    },
  }),
  handler: async (context) => {
    const { sourceFileId, destFolderId, name } = context.validatedBody!;

    try {
      // Extract file IDs from URLs if needed
      const extractedSourceId = extractFileId(sourceFileId);
      const extractedDestId = extractFileId(destFolderId);

      const gsuiteUser = context.universe!.gsuite.user(context.userEmail!);
      const drive = gsuiteUser.drive();
      const newFile = await drive.copyFile({
        sourceFileId: extractedSourceId,
        destFolderId: extractedDestId,
        name,
      });
      return {
        success: true,
        id: newFile.id,
        name: newFile.file.name || "",
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to copy Drive file"
      );
    }
  },
  requiredModules: [UniverseModule.GSuite],
};
