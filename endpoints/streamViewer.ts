import { ScratchEndpointDefinition } from "../src";

export const streamViewer: ScratchEndpointDefinition = {
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
