import { ScratchEndpointDefinition } from "../src";

export const listEndpoints: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "listEndpoints",
    blockType: "reporter",
    text: "list all endpoints",
  }),
  handler: async (context) => {
    const endpointDefinitions = context.universe!.httpServer.getAllEndpoints();

    // Resolve all block definitions
    const resolvedEndpoints = await Promise.all(
      endpointDefinitions.map(async (epDef) => {
        const blockDef = await epDef.block(context);
        if (!blockDef.opcode || blockDef.opcode === "") {
          throw new Error("Endpoint opcode cannot be empty");
        }
        const method = blockDef.blockType === "reporter" ? "GET" : "POST";
        const endpoint = `/${blockDef.opcode}`;

        return {
          method,
          path: endpoint,
          opcode: blockDef.opcode,
          blockType: blockDef.blockType,
          text: blockDef.text,
          schema: blockDef.schema,
          requiresAuth: !epDef.noAuth,
        };
      })
    );

    // Sort alphabetically by text (emergent property - sorted at source)
    resolvedEndpoints.sort((a, b) => a.text.localeCompare(b.text));

    return resolvedEndpoints;
  },
  noAuth: true,
};
