import { Context } from "hono";

/**
 * Renders the HTML page for viewing a stream in real-time
 *
 * @param streamName - Name of the stream to view
 * @returns HTML string for the stream viewer page
 */
export function renderStreamViewer(streamName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stream: ${streamName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: #58a6ff;
      margin-bottom: 20px;
      font-size: 24px;
    }
    .status {
      margin-bottom: 20px;
      padding: 10px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 14px;
    }
    .records {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .record {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 16px;
      font-size: 13px;
    }
    .record-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #30363d;
    }
    .record-type {
      color: #79c0ff;
      font-weight: 600;
    }
    .record-time {
      color: #8b949e;
      font-size: 12px;
    }
    .record-data {
      color: #c9d1d9;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
    }
    .empty {
      text-align: center;
      color: #8b949e;
      padding: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Stream: ${streamName}</h1>
    <div id="auth-message" style="display: none; margin-bottom: 20px; padding: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; text-align: center;">
      <p style="color: #c9d1d9; margin-bottom: 12px;">Authentication required to view this stream.</p>
      <a href="/admin" style="color: #58a6ff; text-decoration: none; font-weight: 600;">Go to Admin →</a>
    </div>
    <div class="status" id="status">Loading...</div>
    <div class="records" id="records">
      <div class="empty">No records yet</div>
    </div>
  </div>
  <script>
    const streamName = "${streamName}";
    let lastCount = 0;
    
    function getToken() {
      return localStorage.getItem("adminToken") || "";
    }
    
    function checkAuth() {
      const token = getToken();
      const authMessage = document.getElementById('auth-message');
      const status = document.getElementById('status');
      const records = document.getElementById('records');
      
      if (!token) {
        authMessage.style.display = 'block';
        status.style.display = 'none';
        records.style.display = 'none';
        return false;
      } else {
        authMessage.style.display = 'none';
        status.style.display = 'block';
        records.style.display = 'block';
        return true;
      }
    }
    
    async function fetchStream() {
      if (!checkAuth()) {
        return;
      }
      
      try {
        const token = getToken();
        const headers = {};
        if (token) {
          headers["Authorization"] = \`Bearer \${token}\`;
        }
        
        const response = await fetch(\`/api/checkStreamTailRaw?streamName=\${streamName}&limit=50\`, {
          headers: headers
        });
        if (!response.ok) {
          if (response.status === 404) {
            document.getElementById('status').style.display = 'none';
            document.getElementById('records').innerHTML = '<div class="empty">Stream not found</div>';
          } else {
            document.getElementById('status').textContent = \`Error: \${response.status}\`;
          }
          return;
        }
        const allRecords = await response.json();
        // Filter out null values and reverse to show newest first
        const records = allRecords.filter(record => record !== null).reverse();
        
        if (records.length !== lastCount) {
          lastCount = records.length;
          document.getElementById('status').textContent = \`\${records.length} record(s)\`;
          
          const container = document.getElementById('records');
          container.innerHTML = records.length === 0 
            ? '<div class="empty">No records yet</div>'
            : records.map((record, idx) => {
                const time = record.time ? new Date(record.time).toLocaleString() : 'N/A';
                const data = JSON.stringify(record.data || record, null, 2);
                return \`
                  <div class="record">
                    <div class="record-header">
                      <span class="record-type">\${record.type || 'N/A'}</span>
                      <span class="record-time">\${time}</span>
                    </div>
                    <div class="record-data">\${data}</div>
                  </div>
                \`;
              }).join('');
        }
      } catch (error) {
        document.getElementById('status').textContent = \`Error: \${error.message}\`;
      }
    }
    
    // Check auth on load
    checkAuth();
    
    // Poll every 2 seconds
    fetchStream();
    setInterval(fetchStream, 2000);
  </script>
</body>
</html>`;
}
