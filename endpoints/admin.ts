import { ScratchEndpointDefinition } from "../src";

export const admin: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "admin",
    blockType: "reporter",
    text: "admin interface",
  }),
  handler: async (context) => {
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin Interface</title>
    <link rel="stylesheet" href="/sharedCss" />
    <script src="/sharedJs"></script>
    <style>
      .auth-section {
        margin-bottom: 20px;
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
      }
      input[type="password"], input[type="email"] {
        width: 300px;
        margin-right: 10px;
      }
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
        padding: 8px 12px;
        margin: 4px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #fafafa;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .email-item input[type="checkbox"] {
        margin: 0;
        cursor: pointer;
      }
      .email-item-content {
        flex: 1;
        display: flex;
        gap: 15px;
        align-items: center;
        font-size: 14px;
      }
      .email-item-content > span {
        min-width: 0;
      }
      .email-to {
        font-weight: 500;
        min-width: 200px;
      }
      .email-from {
        color: #666;
        min-width: 200px;
      }
      .email-subject {
        flex: 1;
      }
      .email-time {
        color: #999;
        font-size: 12px;
        min-width: 150px;
      }
      .select-all {
        margin-bottom: 10px;
        padding: 8px;
        background: #f0f0f0;
        border-radius: 4px;
      }
      .select-all label {
        cursor: pointer;
        font-weight: 500;
      }
      .user-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 10px;
        background: #f9f9f9;
        border-radius: 4px;
      }
      .user-info span {
        font-weight: 500;
      }
      .health-check {
        margin-bottom: 20px;
        padding: 10px;
        background: #f9f9f9;
        border-radius: 4px;
      }
      .health-check strong {
        margin-right: 10px;
      }
      .add-email-form {
        margin: 20px 0;
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
      }
      .add-email-form h3 {
        margin-bottom: 15px;
      }
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
      .endpoints-section {
        margin-top: 20px;
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
      }
      .endpoints-section h2 {
        margin-bottom: 10px;
        font-size: 18px;
      }
      .endpoints-section table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .endpoints-section table th {
        padding: 8px;
        text-align: left;
        background: #f5f5f5;
        border-bottom: 2px solid #ddd;
        font-weight: 600;
      }
      .endpoints-section table td {
        padding: 6px 8px;
        border-bottom: 1px solid #eee;
      }
      .endpoints-section table tr:hover {
        background: #fafafa;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Admin Interface</h1>

      <div class="auth-section" id="authSection">
        <p>Enter JWT token to authenticate:</p>
        <input type="password" id="jwtInput" placeholder="JWT Token" />
        <button onclick="authenticate()">Authenticate</button>
        <div id="authStatus"></div>

        <div
          id="jwtSendSection"
          style="
            display: none;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          "
        >
          <p><strong>Or send a new JWT token to your email:</strong></p>
          <div style="display: flex; gap: 10px; align-items: center">
            <input
              type="email"
              id="jwtEmailInput"
              placeholder="your-email@domain.com"
              style="
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
              "
            />
            <button onclick="sendJWT()" id="sendJwtBtn">Send JWT</button>
          </div>
          <div id="jwtSendStatus" style="margin-top: 10px"></div>
          <p style="font-size: 12px; color: #666; margin-top: 10px">
            Allowed domains: <span id="allowedDomains">-</span>
          </p>
        </div>
      </div>

      <div id="adminContent" style="display: none">
        <div class="user-info">
          <span>Logged in as: <strong id="userEmail">-</strong></span>
          <div style="display: flex; gap: 10px">
            <button onclick="openScratch()" id="openScratchBtn">
              Open Scratch
            </button>
            <button onclick="openScratchSource()" id="openScratchSourceBtn">
              View Extension Source
            </button>
            <button onclick="logout()" class="secondary">Logout</button>
          </div>
        </div>

        <div class="health-check" id="healthCheck">
          <strong>System Health Status:</strong>
          <span id="healthStatus">Checking...</span>
        </div>
      </div>

      <div class="endpoints-section" id="endpointsSection">
        <h2 style="margin-bottom: 10px; font-size: 18px">
          Available Endpoints
        </h2>
        <div id="endpointsContainer">Loading endpoints...</div>
      </div>
    </div>

    <script>
      (function () {
        let token = window.getToken();

        // Check for available domains on page load
        checkDomains();

        // Add Enter key support for JWT email input
        let jwtEmailInputHandler = null;
        function setupJWTEmailInput() {
          const jwtEmailInput = document.getElementById("jwtEmailInput");
          if (jwtEmailInput) {
            // Remove existing handler if it exists to prevent duplicates
            if (jwtEmailInputHandler) {
              jwtEmailInput.removeEventListener("keypress", jwtEmailInputHandler);
            }
            // Create and add new handler
            jwtEmailInputHandler = function(e) {
              if (e.key === "Enter") {
                e.preventDefault();
                sendJWT();
              }
            };
            jwtEmailInput.addEventListener("keypress", jwtEmailInputHandler);
          }
        }

        // Setup when DOM is ready
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", setupJWTEmailInput);
        } else {
          setupJWTEmailInput();
        }

        if (token) {
          document.getElementById("jwtInput").value = token;
          authenticate();
        }

        // Load endpoints on page load (works without auth)
        loadEndpoints();

        async function checkDomains() {
          try {
            const response = await fetch("/getDomains");
            const domains = await response.json();

            if (Array.isArray(domains) && domains.length > 0) {
              document.getElementById("jwtSendSection").style.display = "block";
              document.getElementById("allowedDomains").textContent =
                domains.join(", ");
              // Setup Enter key handler when section becomes visible
              setupJWTEmailInput();
            } else {
              // Empty array means no well-functioning domains - hide the section
              document.getElementById("jwtSendSection").style.display = "none";
            }
          } catch (error) {
            console.error("Failed to check domains:", error);
            document.getElementById("jwtSendSection").style.display = "none";
          }
        }

        async function sendJWT() {
          const email = document.getElementById("jwtEmailInput").value;
          if (!email) {
            showStatus("Please enter an email address", "error", "jwtSendStatus");
            return;
          }

          const btn = document.getElementById("sendJwtBtn");
          btn.disabled = true;
          showStatus("Sending JWT token...", "info", "jwtSendStatus");

          try {
            const response = await fetch("/sendJwt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
              showStatus(
                "JWT token sent successfully! Check your email.",
                "success",
                "jwtSendStatus"
              );
              document.getElementById("jwtEmailInput").value = "";
            } else {
              showStatus(
                "Error: " + (data.error || "Failed to send JWT token"),
                "error",
                "jwtSendStatus"
              );
            }
          } catch (error) {
            showStatus(
              "Failed to send JWT token: " + error.message,
              "error",
              "jwtSendStatus"
            );
          } finally {
            btn.disabled = false;
          }
        }

        async function authenticate() {
          token = document.getElementById("jwtInput").value;
          if (!token) {
            showStatus("Please enter a JWT token", "error", "authStatus");
            return;
          }
          window.setToken(token);

          // Get user info
          try {
            const response = await fetch("/getUser", {
              method: "GET",
              headers: window.getAuthHeaders(),
            });
            if (response.status === 401) {
              showStatus("Authentication failed", "error", "authStatus");
              return;
            }
            // getUser returns plain text (email string), not JSON
            const userEmail = await response.text();
            document.getElementById("userEmail").textContent = userEmail || "Unknown";
          } catch (error) {
            console.error("Failed to get user info:", error);
          }

          document.getElementById("authSection").style.display = "none";
          document.getElementById("adminContent").style.display = "block";
          loadHealthCheck();
        }

        function openScratch() {
          if (!token) {
            showStatus("No token available", "error");
            return;
          }

          // Construct Scratch URL with the JWT token
          const baseUrl = window.location.origin;
          const extensionUrl = baseUrl + "/extension?jwt=" + encodeURIComponent(token);
          const scratchUrl = "https://sheeptester.github.io/scratch-gui/?url=" + encodeURIComponent(extensionUrl);

          // Open in new tab
          window.open(scratchUrl, "_blank");
        }

        function openScratchSource() {
          if (!token) {
            showStatus("No token available", "error");
            return;
          }

          // Construct extension source URL with the JWT token
          const baseUrl = window.location.origin;
          const extensionUrl = baseUrl + "/extension?jwt=" + encodeURIComponent(token);

          // Open extension source in new tab
          window.open(extensionUrl, "_blank");
        }

        function logout() {
          window.setToken("");
          token = "";
          document.getElementById("jwtInput").value = "";
          document.getElementById("authSection").style.display = "block";
          document.getElementById("adminContent").style.display = "none";
          document.getElementById("userEmail").textContent = "-";
        }

        async function loadHealthCheck() {
          try {
            const response = await fetch("/getHealth", {
              method: "GET",
              headers: window.getAuthHeaders(),
            });

            if (response.status === 401) {
              document.getElementById("healthStatus").textContent = "Unauthorized";
              return;
            }

            const data = await response.json();
            const statusEl = document.getElementById("healthStatus");
            const healthCheckEl = document.getElementById("healthCheck");

            // Parse the health response structure
            const overallStatus = data.status || "unknown";
            const services = data.services || {};

            // Build status message from all services
            const serviceStatuses = Object.entries(services).map(function([name, service]) {
              const statusIcon = service.connected ? "✓" : "✗";
              const serviceName = name.charAt(0).toUpperCase() + name.slice(1);
              return statusIcon + " " + serviceName + ": " + (service.message || service.status);
            });

            const statusText =
              serviceStatuses.length > 0
                ? serviceStatuses.join(" | ")
                : "Overall: " + overallStatus;

            statusEl.textContent = statusText;

            // Set colors based on overall status
            if (overallStatus === "ok") {
              statusEl.style.color = "#155724";
              healthCheckEl.style.background = "#d4edda";
            } else if (overallStatus === "warning") {
              statusEl.style.color = "#856404";
              healthCheckEl.style.background = "#fff3cd";
            } else {
              statusEl.style.color = "#721c24";
              healthCheckEl.style.background = "#f8d7da";
            }
          } catch (error) {
            document.getElementById("healthStatus").textContent = "✗ Error: " + error.message;
            document.getElementById("healthStatus").style.color = "#721c24";
            document.getElementById("healthCheck").style.background = "#f8d7da";
          }
        }

        function showStatus(message, type, elementId) {
          if (!elementId) elementId = "status";
          const el = document.getElementById(elementId);
          if (!el) return;
          el.innerHTML = '<div class="status ' + type + '">' + message + "</div>";
          setTimeout(function() {
            if (elementId === "status") el.innerHTML = "";
          }, 5000);
        }

        async function loadEndpoints() {
          try {
            const response = await fetch("/listEndpoints");
            if (!response.ok) {
              throw new Error("HTTP " + response.status);
            }
            const data = await response.json();

            // Handle both { endpoints: [...] } and [...] formats
            const endpoints = Array.isArray(data) ? data : data.endpoints || [];
            const container = document.getElementById("endpointsContainer");

            if (endpoints.length === 0) {
              container.innerHTML = "<p>No endpoints available</p>";
              return;
            }

            // Create compact table view
            let html = '<div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse; font-size: 13px;"><thead><tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;"><th style="padding: 8px; text-align: left; width: 60px;">Method</th><th style="padding: 8px; text-align: left; min-width: 200px;">Path</th><th style="padding: 8px; text-align: left;">Description</th><th style="padding: 8px; text-align: center; width: 80px;">Auth</th></tr></thead><tbody>';

            endpoints.forEach(function(endpoint) {
              const methodColor = endpoint.method === "GET" ? "#28a745" : "#0366d6";
              const authBadge = endpoint.requiresAuth
                ? '<span style="color: #856404; font-weight: 500;">Required</span>'
                : '<span style="color: #155724;">No</span>';

              html += '<tr style="border-bottom: 1px solid #eee;"><td style="padding: 6px 8px;"><span style="display: inline-block; padding: 2px 6px; background: ' + methodColor + '; color: white; border-radius: 3px; font-size: 11px; font-weight: 600;">' + endpoint.method + '</span></td><td style="padding: 6px 8px; font-family: monospace; font-size: 12px;">' + (endpoint.path || "") + '</td><td style="padding: 6px 8px; color: #666;">' + (endpoint.text || endpoint.opcode || "-") + '</td><td style="padding: 6px 8px; text-align: center;">' + authBadge + "</td></tr>";
            });

            html += '</tbody></table></div><p style="margin-top: 10px; font-size: 12px; color: #666;">Total: ' + endpoints.length + ' endpoint' + (endpoints.length !== 1 ? "s" : "") + "</p>";

            container.innerHTML = html;
          } catch (error) {
            document.getElementById("endpointsContainer").innerHTML =
              '<p style="color: #721c24;">Error loading endpoints: ' + error.message + "</p>";
          }
        }

        // Make functions globally available
        window.authenticate = authenticate;
        window.sendJWT = sendJWT;
        window.openScratch = openScratch;
        window.openScratchSource = openScratchSource;
        window.logout = logout;
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
