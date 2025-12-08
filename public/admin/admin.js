let token = localStorage.getItem("adminToken") || "";

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
    jwtEmailInputHandler = (e) => {
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
    const response = await fetch("/api/getDomains");
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
    const response = await fetch("/api/sendJwt", {
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
  localStorage.setItem("adminToken", token);

  // Get user info
  try {
    const response = await fetch("/api/getUser", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
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
  const extensionUrl = `${baseUrl}/extension/${token}.js`;
  const scratchUrl = `https://sheeptester.github.io/scratch-gui/?url=${encodeURIComponent(
    extensionUrl
  )}`;

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
  const extensionUrl = `${baseUrl}/extension/${token}.js`;

  // Open extension source in new tab
  window.open(extensionUrl, "_blank");
}

function logout() {
  localStorage.removeItem("adminToken");
  token = "";
  document.getElementById("jwtInput").value = "";
  document.getElementById("authSection").style.display = "block";
  document.getElementById("adminContent").style.display = "none";
  document.getElementById("userEmail").textContent = "-";
}

async function loadHealthCheck() {
  try {
    const response = await fetch("/api/getHealth", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
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
    const serviceStatuses = Object.entries(services).map(([name, service]) => {
      const statusIcon = service.connected ? "✓" : "✗";
      const serviceName = name.charAt(0).toUpperCase() + name.slice(1);
      return `${statusIcon} ${serviceName}: ${
        service.message || service.status
      }`;
    });

    const statusText =
      serviceStatuses.length > 0
        ? serviceStatuses.join(" | ")
        : `Overall: ${overallStatus}`;

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
    document.getElementById(
      "healthStatus"
    ).textContent = `✗ Error: ${error.message}`;
    document.getElementById("healthStatus").style.color = "#721c24";
    document.getElementById("healthCheck").style.background = "#f8d7da";
  }
}

function showStatus(message, type, elementId = "status") {
  const el = document.getElementById(elementId);
  el.innerHTML = `<div class="status ${type}">${message}</div>`;
  setTimeout(() => {
    if (elementId === "status") el.innerHTML = "";
  }, 5000);
}

async function loadEndpoints() {
  try {
    const response = await fetch("/api/listEndpoints");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    // Handle both { endpoints: [...] } and [...] formats
    const endpoints = Array.isArray(data) ? data : (data.endpoints || []);
    const container = document.getElementById("endpointsContainer");

    if (endpoints.length === 0) {
      container.innerHTML = "<p>No endpoints available</p>";
      return;
    }

    // Create compact table view
    let html = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
              <th style="padding: 8px; text-align: left; width: 60px;">Method</th>
              <th style="padding: 8px; text-align: left; min-width: 200px;">Path</th>
              <th style="padding: 8px; text-align: left;">Description</th>
              <th style="padding: 8px; text-align: center; width: 80px;">Auth</th>
            </tr>
          </thead>
          <tbody>
    `;

    endpoints.forEach((endpoint) => {
      const methodColor =
        endpoint.method === "GET" ? "#28a745" : "#0366d6";
      const authBadge = endpoint.requiresAuth
        ? '<span style="color: #856404; font-weight: 500;">Required</span>'
        : '<span style="color: #155724;">No</span>';

      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 6px 8px;">
            <span style="
              display: inline-block;
              padding: 2px 6px;
              background: ${methodColor};
              color: white;
              border-radius: 3px;
              font-size: 11px;
              font-weight: 600;
            ">${endpoint.method}</span>
          </td>
          <td style="padding: 6px 8px; font-family: monospace; font-size: 12px;">
            ${endpoint.path}
          </td>
          <td style="padding: 6px 8px; color: #666;">
            ${endpoint.text || endpoint.opcode || "-"}
          </td>
          <td style="padding: 6px 8px; text-align: center;">
            ${authBadge}
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
      <p style="margin-top: 10px; font-size: 12px; color: #666;">
        Total: ${endpoints.length} endpoint${endpoints.length !== 1 ? "s" : ""}
      </p>
    `;

    container.innerHTML = html;
  } catch (error) {
    document.getElementById("endpointsContainer").innerHTML = `
      <p style="color: #721c24;">Error loading endpoints: ${error.message}</p>
    `;
  }
}
