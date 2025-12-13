import { ScratchEndpointDefinition, DEFAULT_BASIC_DEMO } from "@divizend/scratch-core";

export const basicRepl: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "basicRepl",
    blockType: "reporter",
    text: "BASIC REPL",
  }),
  handler: async (context) => {
    // Escape the default code for HTML
    const defaultCodeEscaped = DEFAULT_BASIC_DEMO.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BASIC REPL</title>
  <link rel="stylesheet" href="/sharedCss" />
  <script src="/sharedJs"></script>
  <style>
    .repl-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .code-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .code-section label {
      font-weight: 600;
      margin-bottom: 5px;
    }
    textarea {
      width: 100%;
      min-height: 200px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      resize: vertical;
    }
    .output-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .output-section label {
      font-weight: 600;
      margin-bottom: 5px;
    }
    .output-code {
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 12px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .form-group {
      margin-bottom: 15px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .form-group input {
      width: 100%;
      max-width: 300px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>BASIC REPL</h1>
    
    <div class="repl-container">
      <div class="form-group">
        <label for="opcode">Endpoint Opcode:</label>
        <input type="text" id="opcode" placeholder="basicCounter" value="basicCounter" />
      </div>

      <div class="code-section">
        <label for="basicCode">BASIC Code:</label>
        <textarea id="basicCode" placeholder="# Enter your BASIC code here (first line is the text)">${defaultCodeEscaped}</textarea>
      </div>

      <div class="actions">
        <button onclick="compileCode()">Compile to TypeScript</button>
        <button onclick="registerEndpoint()" id="registerBtn" disabled>Register Endpoint</button>
        <button onclick="clearAll()" class="secondary">Clear All</button>
      </div>

      <div class="output-section" id="outputSection" style="display: none;">
        <label>TypeScript Output:</label>
        <div class="output-code" id="typescriptOutput"></div>
      </div>

      <div id="status"></div>
    </div>
  </div>

  <script>
    (function() {
      let compiledTypeScript = null;

      async function compileCode() {
        const basicCode = document.getElementById("basicCode").value;
        const opcode = document.getElementById("opcode").value.trim();

        if (!basicCode.trim()) {
          showStatus("Please enter BASIC code", "error");
          return;
        }

        if (!opcode) {
          showStatus("Please enter an opcode", "error");
          return;
        }

        showStatus("Compiling...", "info");

        try {
          const url = "/compileBasic?code=" + encodeURIComponent(basicCode) + "&opcode=" + encodeURIComponent(opcode);
          const response = await fetch(url, {
            method: "GET",
            headers: window.getAuthHeaders(),
          });

          const result = await response.json();

          if (result.success) {
            compiledTypeScript = result.typescript;
            document.getElementById("typescriptOutput").textContent = result.typescript;
            document.getElementById("outputSection").style.display = "block";
            document.getElementById("registerBtn").disabled = false;
            showStatus("Compilation successful!", "success");
          } else {
            showStatus("Compilation error: " + (result.error || "Unknown error"), "error");
            document.getElementById("outputSection").style.display = "none";
            document.getElementById("registerBtn").disabled = true;
          }
        } catch (error) {
          showStatus("Error: " + error.message, "error");
          document.getElementById("outputSection").style.display = "none";
          document.getElementById("registerBtn").disabled = true;
        }
      }

      async function registerEndpoint() {
        if (!compiledTypeScript) {
          showStatus("Please compile the code first", "error");
          return;
        }

        const btn = document.getElementById("registerBtn");
        btn.disabled = true;
        btn.textContent = "Registering...";
        showStatus("Registering endpoint...", "info");

        try {
          const response = await fetch("/registerEndpoint", {
            method: "POST",
            headers: window.getAuthHeaders({
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({ source: compiledTypeScript }),
          });

          const result = await response.json();

          if (result.success) {
            showStatus("Endpoint registered successfully! Opcode: " + result.opcode, "success");
            btn.textContent = "Register Endpoint";
            btn.disabled = false;
          } else {
            showStatus("Registration error: " + (result.error || "Unknown error"), "error");
            btn.textContent = "Register Endpoint";
            btn.disabled = false;
          }
        } catch (error) {
          showStatus("Error: " + error.message, "error");
          btn.textContent = "Register Endpoint";
          btn.disabled = false;
        }
      }

      function clearAll() {
        document.getElementById("basicCode").value = "";
          document.getElementById("opcode").value = "basicCounter";
        document.getElementById("outputSection").style.display = "none";
        document.getElementById("registerBtn").disabled = true;
        compiledTypeScript = null;
        showStatus("", "");
      }

      function showStatus(message, type) {
        const statusEl = document.getElementById("status");
        if (!message) {
          statusEl.innerHTML = "";
          return;
        }
        statusEl.innerHTML = '<div class="status ' + type + '">' + message + "</div>";
        if (type === "success" || type === "error") {
          setTimeout(() => {
            statusEl.innerHTML = "";
          }, 5000);
        }
      }

      // Make functions globally available
      window.compileCode = compileCode;
      window.registerEndpoint = registerEndpoint;
      window.clearAll = clearAll;
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
