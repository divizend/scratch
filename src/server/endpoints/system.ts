import { ScratchEndpointDefinition } from "../scratch";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateJwtToken } from "../auth";
import { scratchEndpoints, ScratchContext, ScratchBlock } from "../scratch";
import { envOrDefault } from "../../core/Env";
import {
  generateExtensionInfo,
  getBaseUrl,
  generateArgumentsFromSchema,
} from "../extension";

// Admin endpoint - serves the admin HTML page
export const adminEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "admin",
    blockType: "reporter",
    text: "admin interface",
  }),
  handler: async (context) => {
    try {
      const templatePath = join(process.cwd(), "public", "admin", "index.html");
      const html = readFileSync(templatePath, "utf-8");
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin Interface</title>
</head>
<body>
  <h1>Admin Interface</h1>
  <p>Admin interface not found. Please ensure public/admin/index.html exists.</p>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
  noAuth: true,
};

// Extension endpoint - serves the Scratch extension source
export const extensionEndpoint: ScratchEndpointDefinition = {
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
    // Get JWT from query parameter (since this is a GET request)
    const jwtToken = (context as any).query?.jwt || "";

    if (!jwtToken) {
      return new Response("JWT token required. Use ?jwt=...", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Validate JWT token
    const payload = await validateJwtToken(jwtToken);
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

    // Determine the base URL from the request context
    const baseUrl = getBaseUrl((context as any).c);

    // Create context with user email
    const scratchContext: ScratchContext = { userEmail: email };

    // Generate the Scratch extension class
    const resolvedEndpoints = await Promise.all(
      scratchEndpoints.map(async (ep) => {
        const block = await ep.block(scratchContext);
        return { ...ep, block };
      })
    );

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
              ep.endpoint
            }" + ${queryParts.join(" + ")}, {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
          } else {
            fetchCode = `    return fetch("${baseUrl}${ep.endpoint}", {
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
          fetchCode = `    return fetch("${baseUrl}${ep.endpoint}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${jwtToken}",
      }${fetchBody ? `,\n      ${fetchBody}` : ""}
    }).then((response) => response.text());`;
        }

        return `  ${ep.opcode}({ ${paramList} }) {
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

// Stream viewer endpoint - serves the stream viewer HTML page
// This is registered as a catch-all route, so the path is extracted from the request
export const streamViewerEndpoint: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "streamViewer",
    blockType: "reporter",
    text: "stream viewer [streamName]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream to view",
      },
    },
  }),
  handler: async (context) => {
    // For stream viewer, extract stream name from the path
    // The path will be like "/scratch-demo" or "/interpreter/inbox"
    const path = (context as any).c?.req?.path || "";
    const streamName =
      path.replace(/^\//, "") ||
      context.validatedBody?.streamName ||
      (context as any).query?.streamName ||
      "scratch-demo";

    // Generate HTML inline (template file was removed)
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream: ${streamName}</title>
  <link rel="stylesheet" href="/admin/admin.css" />
  <style>
    .records {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 20px;
    }
    .record {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
      font-size: 14px;
    }
    .record-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ddd;
    }
    .record-type {
      font-weight: 600;
      color: #0366d6;
    }
    .record-time {
      color: #999;
      font-size: 12px;
    }
    .record-data {
      white-space: pre-wrap;
      word-break: break-all;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      color: #333;
    }
    .empty {
      text-align: center;
      color: #666;
      padding: 40px;
    }
    .auth-message {
      margin-bottom: 20px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
      text-align: center;
    }
    .auth-message p {
      margin-bottom: 12px;
    }
    .auth-message a {
      color: #0366d6;
      text-decoration: none;
      font-weight: 600;
    }
    .auth-message a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Stream: ${streamName}</h1>
    <div id="auth-message" class="auth-message" style="display: none;">
      <p>Authentication required to view this stream.</p>
      <a href="/admin">Go to Admin →</a>
    </div>
    <div class="status info" id="status">Loading...</div>
    <div class="records" id="records">
      <div class="empty">No records yet</div>
    </div>
  </div>
  <script>
    // Set stream name for the JavaScript file
    window.STREAM_NAME = "${streamName}";
  </script>
  <script src="/streamViewer.js"></script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
  noAuth: true,
};

export const systemEndpoints: ScratchEndpointDefinition[] = [
  adminEndpoint,
  extensionEndpoint,
  streamViewerEndpoint,
];
