import { ScratchEndpointDefinition } from "../../core";
import { getAllEndpointDefinitions } from "../endpoints";

export const listEndpoints: ScratchEndpointDefinition = {
  block: async (context) => ({
    opcode: "listEndpoints",
    blockType: "reporter",
    text: "list all endpoints",
  }),
  handler: async (context) => {
    const endpointDefinitions = getAllEndpointDefinitions();

    // Resolve all block definitions
    const resolvedEndpoints = await Promise.all(
      endpointDefinitions.map(async (epDef) => {
        const blockDef = await epDef.block(context);
        const method = blockDef.blockType === "reporter" ? "GET" : "POST";
        // Handle root endpoint (empty opcode maps to "/")
        const endpoint = blockDef.opcode === "" ? "/" : `/${blockDef.opcode}`;

        return {
          method,
          path: endpoint,
          opcode: blockDef.opcode || "",
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
