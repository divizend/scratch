import { ScratchEndpointDefinition } from "@divizend/scratch-core";

export const streamViewer: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "streamViewer",
    blockType: "reporter",
    text: "view stream [streamName]",
    schema: {
      streamName: {
        type: "string",
        default: "scratch-demo",
        description: "Name of the stream to view",
      },
    },
  }),
  handler: async (context) => {
    const streamName = context.inputs?.streamName || "scratch-demo";

    // Generate complete HTML with inline JavaScript
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream: ${streamName}</title>
  <link rel="stylesheet" href="/sharedCss" />
  <script src="/sharedJs"></script>
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
    <div class="records" id="records"></div>
  </div>
  <script>
    (function () {
      const streamName = ${JSON.stringify(streamName)};
      let lastCount = 0;


      function checkAuth() {
        const token = window.getToken();
        const authMessage = document.getElementById("auth-message");
        const status = document.getElementById("status");
        const records = document.getElementById("records");

        if (!token) {
          authMessage.style.display = "block";
          status.style.display = "none";
          records.style.display = "none";
          return false;
        } else {
          authMessage.style.display = "none";
          status.style.display = "block";
          records.style.display = "block";
          return true;
        }
      }

      async function createStream() {
        const token = window.getToken();
        if (!token) {
          alert("Authentication required. Please go to /admin to authenticate.");
          return;
        }

        const button = document.getElementById("create-stream-btn");
        if (button) {
          button.disabled = true;
          button.textContent = "Creating...";
        }

        try {
          const response = await fetch("/createStream", {
            method: "POST",
            headers: window.getAuthHeaders({
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({ streamName: streamName }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || "Failed to create stream");
          }

          // Stream created successfully, refresh the view
          if (button) {
            button.textContent = "Stream Created!";
            button.style.background = "#28a745";
          }

          // Wait a moment then refresh
          setTimeout(() => {
            fetchStream();
          }, 500);
        } catch (error) {
          alert("Error creating stream: " + error.message);
          if (button) {
            button.disabled = false;
            button.textContent = "Create Stream";
          }
        }
      }

      async function fetchStream() {
        if (!checkAuth()) {
          return;
        }

        try {
          const response = await fetch(
            "/checkStreamTailRaw?streamName=" + encodeURIComponent(streamName) + "&limit=50",
            {
              headers: window.getAuthHeaders(),
            }
          );
          if (!response.ok) {
            if (response.status === 404) {
              document.getElementById("status").style.display = "none";
              const recordsEl = document.getElementById("records");
              recordsEl.innerHTML = '<div class="empty"><p style="margin-bottom: 16px;">Stream not found</p><button id="create-stream-btn" onclick="window.createStream()" style="padding: 8px 16px; background: #0366d6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">Create Stream</button></div>';
              // Make createStream available globally
              window.createStream = createStream;
            } else {
              const statusEl = document.getElementById("status");
              statusEl.textContent = "Error: " + response.status;
              statusEl.className = "status error";
            }
            return;
          }
          const allRecords = await response.json();
          // Filter out null values and reverse to show newest first
          const records = allRecords.filter((record) => record !== null).reverse();

          if (records.length !== lastCount) {
            lastCount = records.length;
            const statusEl = document.getElementById("status");
            statusEl.textContent = records.length + " record(s)";
            statusEl.className = "status info";

            const container = document.getElementById("records");
            if (records.length === 0) {
              container.innerHTML = '<div class="empty">No records yet</div>';
            } else {
              container.innerHTML = records.map(function(record) {
                const time = record.time
                  ? new Date(record.time).toLocaleString()
                  : "N/A";
                const data = JSON.stringify(record.data || record, null, 2);
                const type = (record.type || "N/A").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const escapedData = data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return '<div class="record"><div class="record-header"><span class="record-type">' + type + '</span><span class="record-time">' + time + '</span></div><div class="record-data">' + escapedData + '</div></div>';
              }).join("");
            }
          }
        } catch (error) {
          const statusEl = document.getElementById("status");
          statusEl.textContent = "Error: " + (error.message || String(error));
          statusEl.className = "status error";
        }
      }

      // Check auth on load
      checkAuth();

      // Poll every 2 seconds
      fetchStream();
      setInterval(fetchStream, 2000);
    })();
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
  noAuth: true,
};
