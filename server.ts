import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { marked } from "marked";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { jwtVerify } from "jose";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = __dirname;

const app = new Hono();

// Email queue storage
interface QueuedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: string;
  queuedAt: number;
}

const emailQueue: QueuedEmail[] = [];
let isSending = false;

// JWT secret from environment
const JWT_SECRET = process.env.WEB_UI_JWT_SECRET || "";
const JWT_SECRET_KEY = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;

// Helper to extract JWT payload
const getJwtPayload = async (c: any) => {
  if (!JWT_SECRET_KEY) {
    return null;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload;
  } catch (error) {
    return null;
  }
};

// JWT authentication middleware
const jwtAuth = async (c: any, next: any) => {
  if (!JWT_SECRET_KEY) {
    return c.json({ error: "JWT authentication not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  try {
    await jwtVerify(token, JWT_SECRET_KEY);
    await next();
  } catch (error) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
};

// CORS middleware - allow all origins, methods, and headers
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  })
);

// Middleware to set no-cache headers
app.use("*", async (c, next) => {
  await next();
  // Set no-cache headers for all responses
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
});

// Serve README.md from root (formatted as HTML)
app.get("/", async (c) => {
  try {
    const readmePath = join(projectRoot, "README.md");
    const readme = await Bun.file(readmePath).text();
    const html = await marked(readme);
    const styledHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>README</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 { border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 24px; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-size: 85%; }
    pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background-color: transparent; padding: 0; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
    return c.html(styledHtml);
  } catch (error) {
    return c.text("README.md not found", 404);
  }
});

// Email endpoint - queues emails instead of sending immediately
app.post("/api/queue-email", async (c) => {
  try {
    const { from, to, subject, content } = await c.req.json();

    if (!from || !to || !subject || !content) {
      return c.json(
        {
          error: "Missing required parameters: from, to, subject, content",
        },
        400
      );
    }

    // Add to queue instead of sending immediately
    const queuedEmail: QueuedEmail = {
      id: crypto.randomUUID(),
      from,
      to,
      subject,
      content,
      queuedAt: Date.now(),
    };

    emailQueue.push(queuedEmail);

    return c.json({
      success: true,
      id: queuedEmail.id,
      message: "Email queued",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Admin page
app.get("/admin", async (c) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email Queue Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { margin-bottom: 20px; }
    .auth-section {
      margin-bottom: 20px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    input[type="password"] {
      padding: 8px;
      width: 300px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-right: 10px;
    }
    button {
      padding: 8px 16px;
      background: #0366d6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #0256c2; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .actions {
      margin: 20px 0;
      display: flex;
      gap: 10px;
    }
    .queue-info {
      margin: 20px 0;
      padding: 10px;
      background: #e8f4f8;
      border-radius: 4px;
    }
    .email-list {
      margin-top: 20px;
    }
    .email-item {
      padding: 15px;
      margin: 10px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
    }
    .email-item strong { display: block; margin-bottom: 5px; }
    .email-item small { color: #666; }
    .status {
      margin: 10px 0;
      padding: 10px;
      border-radius: 4px;
    }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    .status.info { background: #d1ecf1; color: #0c5460; }
    .user-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .user-info span { font-weight: 500; }
    .add-email-form {
      margin: 20px 0;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .add-email-form h3 { margin-bottom: 15px; }
    .form-group {
      margin-bottom: 10px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: inherit;
    }
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    button.secondary {
      background: #6c757d;
    }
    button.secondary:hover {
      background: #5a6268;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Email Queue Admin</h1>
    
    <div class="auth-section" id="authSection">
      <p>Enter JWT token to authenticate:</p>
      <input type="password" id="jwtInput" placeholder="JWT Token">
      <button onclick="authenticate()">Authenticate</button>
      <div id="authStatus"></div>
    </div>

    <div id="adminContent" style="display: none;">
      <div class="user-info">
        <span>Logged in as: <strong id="userEmail">-</strong></span>
        <button onclick="logout()" class="secondary">Logout</button>
      </div>

      <div class="add-email-form">
        <h3>Add Email to Queue</h3>
        <div class="form-group">
          <label>From:</label>
          <input type="email" id="addFrom" placeholder="sender@example.com" value="scratch-demo@divizend.ai">
        </div>
        <div class="form-group">
          <label>To:</label>
          <input type="email" id="addTo" placeholder="recipient@example.com">
        </div>
        <div class="form-group">
          <label>Subject:</label>
          <input type="text" id="addSubject" placeholder="Email subject">
        </div>
        <div class="form-group">
          <label>Content:</label>
          <textarea id="addContent" placeholder="Email content"></textarea>
        </div>
        <button onclick="addEmail()" id="addBtn">Add to Queue</button>
      </div>

      <div class="queue-info">
        <strong>Queue Status:</strong> <span id="queueCount">0</span> emails queued
      </div>

      <div class="actions">
        <button onclick="loadQueue()">Refresh Queue</button>
        <button onclick="sendAllEmails()" id="sendBtn">Send All Emails</button>
        <button onclick="clearQueue()" id="clearBtn">Clear Queue</button>
      </div>

      <div id="status"></div>

      <div class="email-list" id="emailList"></div>
    </div>
  </div>

  <script>
    let token = localStorage.getItem('adminToken') || '';
    
    if (token) {
      document.getElementById('jwtInput').value = token;
      authenticate();
    }

    async function authenticate() {
      token = document.getElementById('jwtInput').value;
      if (!token) {
        showStatus('Please enter a JWT token', 'error', 'authStatus');
        return;
      }
      localStorage.setItem('adminToken', token);
      
      // Get user info
      try {
        const response = await fetch('/admin/api/user', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (response.status === 401) {
          showStatus('Authentication failed', 'error', 'authStatus');
          return;
        }
        const userData = await response.json();
        document.getElementById('userEmail').textContent = userData.email || 'Unknown';
      } catch (error) {
        console.error('Failed to get user info:', error);
      }
      
      document.getElementById('authSection').style.display = 'none';
      document.getElementById('adminContent').style.display = 'block';
      loadQueue();
    }

    function logout() {
      localStorage.removeItem('adminToken');
      token = '';
      document.getElementById('jwtInput').value = '';
      document.getElementById('authSection').style.display = 'block';
      document.getElementById('adminContent').style.display = 'none';
      document.getElementById('userEmail').textContent = '-';
    }

    async function addEmail() {
      const from = document.getElementById('addFrom').value;
      const to = document.getElementById('addTo').value;
      const subject = document.getElementById('addSubject').value;
      const content = document.getElementById('addContent').value;

      if (!from || !to || !subject || !content) {
        showStatus('Please fill in all fields', 'error');
        return;
      }

      const btn = document.getElementById('addBtn');
      btn.disabled = true;

      try {
        const response = await fetch('/api/queue-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, content })
        });

        const data = await response.json();
        if (data.success) {
          showStatus('Email added to queue', 'success');
          // Clear form
          document.getElementById('addTo').value = '';
          document.getElementById('addSubject').value = '';
          document.getElementById('addContent').value = '';
          loadQueue();
        } else {
          showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (error) {
        showStatus('Failed to add email: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
      }
    }

    async function loadQueue() {
      try {
        const response = await fetch('/admin/api/queue', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        if (response.status === 401) {
          showStatus('Authentication failed. Please re-authenticate.', 'error', 'authStatus');
          document.getElementById('authSection').style.display = 'block';
          document.getElementById('adminContent').style.display = 'none';
          return;
        }
        const data = await response.json();
        document.getElementById('queueCount').textContent = data.queue.length;
        displayEmails(data.queue);
      } catch (error) {
        showStatus('Failed to load queue: ' + error.message, 'error');
      }
    }

    function displayEmails(emails) {
      const list = document.getElementById('emailList');
      if (emails.length === 0) {
        list.innerHTML = '<p>No emails in queue</p>';
        return;
      }
      list.innerHTML = emails.map(email => \`
        <div class="email-item">
          <strong>To:</strong> \${email.to}<br>
          <strong>From:</strong> \${email.from}<br>
          <strong>Subject:</strong> \${email.subject}<br>
          <small>Queued: \${new Date(email.queuedAt).toLocaleString()}</small>
        </div>
      \`).join('');
    }

    async function sendAllEmails() {
      const btn = document.getElementById('sendBtn');
      btn.disabled = true;
      showStatus('Sending emails...', 'info');
      
      try {
        const response = await fetch('/admin/api/queue/send', {
          method: 'POST',
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        
        if (response.status === 401) {
          showStatus('Authentication failed', 'error');
          return;
        }
        
        const data = await response.json();
        if (data.success) {
          showStatus(\`Successfully sent \${data.sent} email(s)\`, 'success');
        } else {
          showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
        loadQueue();
      } catch (error) {
        showStatus('Failed to send emails: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
      }
    }

    async function clearQueue() {
      if (!confirm('Are you sure you want to clear the entire queue?')) {
        return;
      }
      
      const btn = document.getElementById('clearBtn');
      btn.disabled = true;
      
      try {
        const response = await fetch('/admin/api/queue/clear', {
          method: 'POST',
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        
        if (response.status === 401) {
          showStatus('Authentication failed', 'error');
          return;
        }
        
        const data = await response.json();
        if (data.success) {
          showStatus('Queue cleared', 'success');
        } else {
          showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        }
        loadQueue();
      } catch (error) {
        showStatus('Failed to clear queue: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
      }
    }

    function showStatus(message, type, elementId = 'status') {
      const el = document.getElementById(elementId);
      el.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
      setTimeout(() => {
        if (elementId === 'status') el.innerHTML = '';
      }, 5000);
    }
  </script>
</body>
</html>`;
  return c.html(html);
});

// Admin API: Get user info
app.get("/admin/api/user", jwtAuth, async (c) => {
  const payload = await getJwtPayload(c);
  return c.json({ email: (payload as any)?.email || "Unknown" });
});

// Admin API: Get queue
app.get("/admin/api/queue", jwtAuth, async (c) => {
  return c.json({ queue: emailQueue });
});

// Admin API: Clear queue
app.post("/admin/api/queue/clear", jwtAuth, async (c) => {
  emailQueue.length = 0;
  return c.json({ success: true, message: "Queue cleared" });
});

// Admin API: Send all emails
app.post("/admin/api/queue/send", jwtAuth, async (c) => {
  if (isSending) {
    return c.json({ error: "Email sending already in progress" }, 409);
  }

  if (emailQueue.length === 0) {
    return c.json({ success: true, sent: 0, message: "Queue is empty" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return c.json(
      { error: "RESEND_API_KEY environment variable is not set" },
      500
    );
  }

  isSending = true;
  let sent = 0;
  let errors = 0;

  // Send emails with rate limiting (100ms delay between emails to avoid rate limits)
  for (const email of emailQueue) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          html: `<p>${email.content}</p>`,
        }),
      });

      if (response.ok) {
        sent++;
      } else {
        errors++;
      }

      // Rate limiting: wait 100ms between emails (allows up to 10 emails/second)
      if (emailQueue.indexOf(email) < emailQueue.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      errors++;
    }
  }

  // Clear queue after sending
  emailQueue.length = 0;
  isSending = false;

  return c.json({
    success: true,
    sent,
    errors,
    message: `Sent ${sent} email(s)${errors > 0 ? `, ${errors} error(s)` : ""}`,
  });
});

// Serve static files from public directory
app.use("/*", serveStatic({ root: join(projectRoot, "public") }));

const port = process.env.PORT || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
