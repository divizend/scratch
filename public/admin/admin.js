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

async function checkDomains() {
  try {
    const response = await fetch("/api/getDomains");
    const data = await response.json();

    if (data.available && data.domains && data.domains.length > 0) {
      document.getElementById("jwtSendSection").style.display = "block";
      document.getElementById("allowedDomains").textContent =
        data.domains.join(", ");
      // Setup Enter key handler when section becomes visible
      setupJWTEmailInput();
    } else {
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
    const userData = await response.json();
    document.getElementById("userEmail").textContent =
      userData.email || "Unknown";
  } catch (error) {
    console.error("Failed to get user info:", error);
  }

  document.getElementById("authSection").style.display = "none";
  document.getElementById("adminContent").style.display = "block";
  loadQueue();
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

async function addEmail() {
  const from = document.getElementById("addFrom").value;
  const to = document.getElementById("addTo").value;
  const subject = document.getElementById("addSubject").value;
  const content = document.getElementById("addContent").value;

  if (!from || !to || !subject || !content) {
    showStatus("Please fill in all fields", "error");
    return;
  }

  const btn = document.getElementById("addBtn");
  btn.disabled = true;

  try {
    const response = await fetch("/api/queueEmail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ from, to, subject, content }),
    });

    const data = await response.json();
    if (data.success) {
      // Clear form
      document.getElementById("addTo").value = "";
      document.getElementById("addSubject").value = "";
      document.getElementById("addContent").value = "";
      loadQueue();
    } else {
      showStatus("Error: " + (data.error || "Unknown error"), "error");
    }
  } catch (error) {
    showStatus("Failed to add email: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function loadQueue() {
  try {
    const response = await fetch("/api/getQueue", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      showStatus(
        "Authentication failed. Please re-authenticate.",
        "error",
        "authStatus"
      );
      document.getElementById("authSection").style.display = "block";
      document.getElementById("adminContent").style.display = "none";
      return;
    }
    const data = await response.json();
    document.getElementById("queueCount").textContent = data.queue.length;
    displayEmails(data.queue);
  } catch (error) {
    showStatus("Failed to load queue: " + error.message, "error");
  }
}

function displayEmails(emails) {
  const list = document.getElementById("emailList");
  if (emails.length === 0) {
    list.innerHTML = "<p>No emails in queue</p>";
    return;
  }
  list.innerHTML =
    `
    <div class="select-all">
      <label>
        <input type="checkbox" id="selectAll" onchange="toggleSelectAll()">
        Select All
      </label>
    </div>
  ` +
    emails
      .map(
        (email) => `
    <div class="email-item">
      <input type="checkbox" class="email-checkbox" value="${email.id}">
      <div class="email-item-content">
        <span class="email-to">${email.to}</span>
        <span class="email-from">${email.from}</span>
        <span class="email-subject">${email.subject}</span>
        <span class="email-time">${new Date(
          email.queuedAt
        ).toLocaleString()}</span>
      </div>
    </div>
  `
      )
      .join("");
}

function toggleSelectAll() {
  const selectAll = document.getElementById("selectAll");
  const checkboxes = document.querySelectorAll(".email-checkbox");
  checkboxes.forEach((cb) => (cb.checked = selectAll.checked));
}

function getSelectedEmailIds() {
  const checkboxes = document.querySelectorAll(".email-checkbox:checked");
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function sendAllEmails() {
  const btn = document.getElementById("sendBtn");
  btn.disabled = true;
  showStatus("Sending emails...", "info");

  try {
    const response = await fetch("/api/sendEmails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: JSON.stringify(null) }), // "null" string means send all
    });

    if (response.status === 401) {
      showStatus("Authentication failed", "error");
      return;
    }

    const data = await response.json();
    if (data.success) {
      showStatus(`Successfully sent ${data.sent} email(s)`, "success");
    } else {
      showStatus("Error: " + (data.error || "Unknown error"), "error");
    }
    loadQueue();
  } catch (error) {
    showStatus("Failed to send emails: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function sendSelectedEmails() {
  const selectedIds = getSelectedEmailIds();
  if (selectedIds.length === 0) {
    showStatus("Please select at least one email", "error");
    return;
  }

  const btn = document.getElementById("sendSelectedBtn");
  btn.disabled = true;
  showStatus(`Sending ${selectedIds.length} email(s)...`, "info");

  try {
    const response = await fetch("/api/sendEmails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: JSON.stringify(selectedIds) }),
    });

    if (response.status === 401) {
      showStatus("Authentication failed", "error");
      return;
    }

    const data = await response.json();
    if (data.success) {
      showStatus(`Successfully sent ${data.sent} email(s)`, "success");
    } else {
      showStatus("Error: " + (data.error || "Unknown error"), "error");
    }
    loadQueue();
  } catch (error) {
    showStatus("Failed to send emails: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function removeSelectedEmails() {
  const selectedIds = getSelectedEmailIds();
  if (selectedIds.length === 0) {
    showStatus("Please select at least one email", "error");
    return;
  }

  if (
    !confirm(
      `Are you sure you want to remove ${selectedIds.length} email(s) from the queue?`
    )
  ) {
    return;
  }

  const btn = document.getElementById("removeSelectedBtn");
  btn.disabled = true;

  try {
    const response = await fetch("/api/removeEmails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: JSON.stringify(selectedIds) }),
    });

    if (response.status === 401) {
      showStatus("Authentication failed", "error");
      return;
    }

    const data = await response.json();
    if (data.success) {
      showStatus(`Removed ${data.removed} email(s)`, "success");
    } else {
      showStatus("Error: " + (data.error || "Unknown error"), "error");
    }
    loadQueue();
  } catch (error) {
    showStatus("Failed to remove emails: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function clearQueue() {
  if (!confirm("Are you sure you want to clear the entire queue?")) {
    return;
  }

  const btn = document.getElementById("clearBtn");
  btn.disabled = true;

  try {
    const response = await fetch("/api/clearQueue", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      showStatus("Authentication failed", "error");
      return;
    }

    const data = await response.json();
    if (data.success) {
      // showStatus('Queue cleared', 'success');
    } else {
      showStatus("Error: " + (data.error || "Unknown error"), "error");
    }
    loadQueue();
  } catch (error) {
    showStatus("Failed to clear queue: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
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

    if (data.connected) {
      statusEl.textContent = `✓ Connected (${data.organization || "active"})`;
      statusEl.style.color = "#155724";
      healthCheckEl.style.background = "#d4edda";
    } else {
      statusEl.textContent = `✗ ${data.message || "Disconnected"}`;
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
