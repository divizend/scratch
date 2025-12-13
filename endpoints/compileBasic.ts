import { ScratchEndpointDefinition, compileBasicToTypeScript, DEFAULT_BASIC_DEMO } from "@divizend/scratch-core";

export const compileBasic: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "compileBasic",
    blockType: "reporter",
    text: "compile BASIC code [code] to TypeScript endpoint [opcode]",
    schema: {
      code: {
        type: "string",
        default: DEFAULT_BASIC_DEMO,
        description: "BASIC code to compile",
      },
      opcode: {
        type: "string",
        default: "basicCounter",
        description: "Opcode for the generated endpoint",
      },
    },
  }),
  handler: async (context) => {
    const { code, opcode } = context.inputs!;

    try {
      const typescript = compileBasicToTypeScript(
        code || "",
        opcode || "basicCounter"
      );
      return {
        success: true,
        typescript,
        message: "BASIC code compiled successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  },
};
