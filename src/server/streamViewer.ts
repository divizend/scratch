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
            const statusEl = document.getElementById('status');
            statusEl.textContent = \`Error: \${response.status}\`;
            statusEl.className = 'status error';
          }
          return;
        }
        const allRecords = await response.json();
        // Filter out null values and reverse to show newest first
        const records = allRecords.filter(record => record !== null).reverse();
        
        if (records.length !== lastCount) {
          lastCount = records.length;
          const statusEl = document.getElementById('status');
          statusEl.textContent = \`\${records.length} record(s)\`;
          statusEl.className = 'status info';
          
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
        const statusEl = document.getElementById('status');
        statusEl.textContent = \`Error: \${error.message}\`;
        statusEl.className = 'status error';
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
