import { ScratchEndpointDefinition } from "../src";

export const registerEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "registerEndpoint",
    blockType: "command",
    text: "register endpoint from TypeScript source [source]",
    schema: {
      source: {
        type: "string",
        default: `import { ScratchEndpointDefinition } from "../src";

export const myEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "myEndpoint",
    blockType: "command",
    text: "my endpoint",
  }),
  handler: async (context) => {
    return { success: true };
  },
};`,
        description: "TypeScript source code for the endpoint",
      },
    },
  }),
  handler: async (context) => {
    const { source } = context.validatedBody!;

    try {
      // Create a temporary file to evaluate the TypeScript code
      const tempFile = `/tmp/endpoint_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}.ts`;

      // Write source to temp file
      await Bun.write(tempFile, source);

      try {
        // Import the module
        const module = await import(tempFile);

        // Find the endpoint definition
        let endpoint: ScratchEndpointDefinition | null = null;
        for (const key in module) {
          const value = module[key];
          if (
            value &&
            typeof value === "object" &&
            "block" in value &&
            "handler" in value
          ) {
            endpoint = value as ScratchEndpointDefinition;
            break;
          }
        }

        if (!endpoint) {
          throw new Error("No endpoint definition found in source code");
        }

        // Get the opcode
        const blockDef = await endpoint.block({});
        const opcode = blockDef.opcode || "";

        // Remove old endpoint if it exists (overwrite behavior)
        const httpServer = context.universe!.httpServer as any;
        const scratchEndpoints = httpServer.scratchEndpoints || [];
        const filteredEndpoints = scratchEndpoints.filter(
          (ep: any) => ep.opcode !== opcode
        );
        httpServer.scratchEndpoints = filteredEndpoints;

        // Add to endpoints map (overwrites if exists)
        const endpointsMap = httpServer.endpoints;
        endpointsMap.set(opcode, endpoint);

        // Register the endpoint (this will add HTTP routes)
        await context.universe!.httpServer.registerEndpoints([endpoint]);

        // Rebuild handlers
        await httpServer.buildHandlersObject();

        // Clean up temp file
        try {
          await Bun.file(tempFile).unlink();
        } catch (e) {
          // Ignore cleanup errors
        }

        return {
          success: true,
          opcode,
          message: `Endpoint "${opcode}" registered successfully`,
        };
      } catch (error: any) {
        // Clean up temp file on error
        try {
          await Bun.file(tempFile).unlink();
        } catch (e) {
          // Ignore cleanup errors
        }
        throw error;
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  },
};
