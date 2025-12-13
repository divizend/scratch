import {
  ScratchEndpointDefinition,
  ScratchContext,
  ScratchBlock,
  getUniverse,
  envOrDefault,
} from "@divizend/scratch-core";

// Extension helper functions (moved from extension.ts)

// Generate extension ID and name from hyphenated name
function generateExtensionInfo() {
  const orgName = envOrDefault(undefined, "ORG_NAME", "divizend");
  const orgNamePascal = orgName.charAt(0).toUpperCase() + orgName.slice(1);

  return {
    id: `${orgNamePascal}`,
    displayName: `${orgNamePascal}`,
  };
}

// Determine the base URL for the extension based on the request
function getBaseUrl(requestHost?: string): string {
  const HOSTED_AT = envOrDefault(undefined, "HOSTED_AT", "");
  const port = envOrDefault(undefined, "PORT", "3000");

  // If we have a request host, use it to detect the environment
  if (requestHost) {
    // Normalize requestHost (remove port if it's the default HTTP/HTTPS port)
    const normalizedHost = requestHost.replace(/:80$/, "").replace(/:443$/, "");

    // Check if it's localhost or 127.0.0.1
    if (
      normalizedHost.includes("localhost") ||
      normalizedHost.includes("127.0.0.1") ||
      normalizedHost.startsWith("[::1]")
    ) {
      // Extract port from host if present (e.g., "localhost:3000")
      const hostParts = normalizedHost.split(":");
      if (hostParts.length > 1) {
        const detectedPort = hostParts[hostParts.length - 1];
        return `http://${hostParts[0]}:${detectedPort}`;
  }
      // Use default port if not specified in host
      return `http://${normalizedHost}:${port}`;
    }

    // If HOSTED_AT is set, check if request host matches it
    if (HOSTED_AT) {
      const hostedUrl = HOSTED_AT.startsWith("http")
    ? HOSTED_AT
    : `https://${HOSTED_AT}`;
      const hostedHost = new URL(hostedUrl).host;

      // Check if request host matches hosted host (exact match or subdomain)
      if (
        normalizedHost === hostedHost ||
        normalizedHost.endsWith(`.${hostedHost}`)
      ) {
        return hostedUrl;
      }
    }

    // For any other host, construct URL from request host
    // Use https by default for non-localhost hosts
    const hasPort = normalizedHost.includes(":");
    if (hasPort) {
      return `https://${normalizedHost}`;
    }
    // If no port specified, use default HTTPS port (443) for non-localhost
    return `https://${normalizedHost}`;
  }

  // Fallback: If HOSTED_AT is set, use it (production)
  if (HOSTED_AT) {
    return HOSTED_AT.startsWith("http") ? HOSTED_AT : `https://${HOSTED_AT}`;
  }

  // Otherwise, assume local development
  return `http://localhost:${port}`;
}

// Helper function to generate default value from JSON schema
function generateDefaultFromSchema(jsonSchema: any): any {
  if (jsonSchema.default !== undefined) {
    return jsonSchema.default;
  }

  switch (jsonSchema.type) {
    case "object":
      const obj: any = {};
      if (jsonSchema.properties) {
        for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
          obj[key] = generateDefaultFromSchema(propSchema as any);
        }
      }
      return obj;
    case "array":
      return [];
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return null;
  }
}

// Helper function to generate Scratch arguments from schema properties
function generateArgumentsFromSchema(schema?: ScratchBlock["schema"]): {
  [key: string]: {
    type: "string" | "number" | "boolean";
    defaultValue?: string | number | boolean;
  };
} {
  const arguments_: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      defaultValue?: string | number | boolean;
    };
  } = {};

  if (schema) {
    for (const [key, propSchema] of Object.entries(schema)) {
      // Map JSON schema types to Scratch argument types
      let scratchType: "string" | "number" | "boolean" = "string";
      let defaultValue: any = propSchema.default;

      if (propSchema.type === "number") {
        scratchType = "number";
      } else if (propSchema.type === "boolean") {
        scratchType = "boolean";
      } else if (propSchema.type === "array" || propSchema.type === "object") {
        // Arrays and objects are represented as strings in Scratch (JSON strings)
        scratchType = "string";
        if (defaultValue === undefined) {
          defaultValue = propSchema.type === "array" ? "[]" : "{}";
        } else if (typeof defaultValue !== "string") {
          defaultValue = JSON.stringify(defaultValue);
        }
      } else if (propSchema.type === "json") {
        // JSON type is always a string in Scratch (JSON string)
        scratchType = "string";
        // Generate default from the JSON schema if not provided
        if (defaultValue === undefined && propSchema.schema) {
          const generatedDefault = generateDefaultFromSchema(propSchema.schema);
          defaultValue = JSON.stringify(generatedDefault);
        } else if (
          defaultValue !== undefined &&
          typeof defaultValue !== "string"
        ) {
          defaultValue = JSON.stringify(defaultValue);
        }
      }

      arguments_[key] = {
        type: scratchType,
        defaultValue,
      };
    }
  }

  return arguments_;
}

export const extension: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "extension",
    blockType: "reporter",
    text: "extension source with JWT [jwt]",
    schema: {
      jwt: {
        type: "string",
        default: "",
        description: "JWT token for authentication (required)",
      },
    },
  }),
  handler: async (context) => {
    const universe = getUniverse();
    if (!universe) {
      return new Response("Universe not initialized", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Get JWT from inputs (query params for GET requests go into inputs)
    const jwtToken = context.inputs?.jwt || "";

    if (!jwtToken) {
      return new Response("JWT token required. Use ?jwt=...", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Validate JWT token
    const payload = await universe.auth.validateJwtToken(jwtToken);
    if (!payload) {
      return new Response("Invalid or expired JWT token", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Extract email from JWT payload
    const email = (payload as any)?.email;
    if (!email || typeof email !== "string") {
      return new Response("JWT token does not contain a valid email address", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Generate extension ID and name
    const { id: extensionId, displayName: extensionName } =
      generateExtensionInfo();

    // Determine the base URL from request host
    const requestHost = context.requestHost;
    const baseUrl = getBaseUrl(requestHost);

    // Create context with user email
    const scratchContext: ScratchContext = { userEmail: email };

    // Generate the Scratch extension class
    const endpoints = universe.httpServer.getAllEndpoints();
    const resolvedEndpoints = await Promise.all(
      endpoints.map(async (endpoint) => {
        const block = await endpoint.block(scratchContext);
        if (!block.opcode || block.opcode === "") {
          throw new Error("Endpoint opcode cannot be empty");
        }
        const opcode = block.opcode;
        const endpointPath = `/${opcode}`;
        return { endpoint, block, endpointPath };
      })
    );

    // Sort endpoints alphabetically by text
    resolvedEndpoints.sort((a, b) => a.block.text.localeCompare(b.block.text));

    const blocks = resolvedEndpoints.map((ep) => {
      const args = generateArgumentsFromSchema(ep.block.schema);
      return { ...ep.block, arguments: args };
    });

    const methods = resolvedEndpoints
      .map((ep) => {
        const params = Object.keys(
          generateArgumentsFromSchema(ep.block.schema)
        );
        const paramList = params.join(", ");
        const isGet = ep.block.blockType === "reporter";

        let fetchCode = "";
        if (isGet) {
          if (params.length > 0) {
            const queryParts = params.map(
              (p, idx) =>
                `"${idx === 0 ? "?" : "&"}${p}=" + encodeURIComponent(${p})`
            );
            fetchCode = `    return fetch("${baseUrl}${
              ep.endpointPath
            }" + ${queryParts.join(" + ")}, {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
          } else {
            fetchCode = `    return fetch("${baseUrl}${ep.endpointPath}", {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
          }
        } else {
          const fetchBody =
            params.length > 0
              ? `body: JSON.stringify({ ${params
                  .map((p) => `${p}`)
                  .join(", ")} })`
              : "";
          fetchCode = `    return fetch("${baseUrl}${ep.endpointPath}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${jwtToken}",
      }${fetchBody ? `,\n      ${fetchBody}` : ""}
    }).then((response) => response.text());`;
        }

        // Use block.opcode which may have been normalized to "root"
        const methodOpcode = ep.block.opcode;
        return `  ${methodOpcode}({ ${paramList} }) {
${fetchCode}
  }`;
      })
      .join("\n\n");

    const extensionCode = `class ${extensionId} {
  constructor() {}

  getInfo() {
    return {
      id: "${extensionId}",
      name: "${extensionName}",
      blocks: ${JSON.stringify(blocks, null, 2)},
    };
  }

${methods}
}

Scratch.extensions.register(new ${extensionId}());`;

    return new Response(extensionCode, {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  },
  noAuth: true,
};
