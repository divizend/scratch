// Stream Viewer JavaScript
// Handles real-time stream viewing and stream creation

(function () {
  const streamName = window.STREAM_NAME;
  let lastCount = 0;

  function getToken() {
    return localStorage.getItem("adminToken") || "";
  }

  function checkAuth() {
    const token = getToken();
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
    const token = getToken();
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
      const response = await fetch("/api/createStream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      const token = getToken();
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(
        `/api/checkStreamTailRaw?streamName=${encodeURIComponent(
          streamName
        )}&limit=50`,
        {
          headers: headers,
        }
      );
      if (!response.ok) {
        if (response.status === 404) {
          document.getElementById("status").style.display = "none";
          const recordsEl = document.getElementById("records");
          recordsEl.innerHTML = `
            <div class="empty">
              <p style="margin-bottom: 16px;">Stream not found</p>
              <button id="create-stream-btn" onclick="window.createStream()" style="
                padding: 8px 16px;
                background: #0366d6;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
              ">Create Stream</button>
            </div>
          `;
          // Make createStream available globally
          window.createStream = createStream;
        } else {
          const statusEl = document.getElementById("status");
          statusEl.textContent = `Error: ${response.status}`;
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
        statusEl.textContent = `${records.length} record(s)`;
        statusEl.className = "status info";

        const container = document.getElementById("records");
        container.innerHTML =
          records.length === 0
            ? '<div class="empty">No records yet</div>'
            : records
                .map((record, idx) => {
                  const time = record.time
                    ? new Date(record.time).toLocaleString()
                    : "N/A";
                  const data = JSON.stringify(record.data || record, null, 2);
                  return `
                <div class="record">
                  <div class="record-header">
                    <span class="record-type">${record.type || "N/A"}</span>
                    <span class="record-time">${time}</span>
                  </div>
                  <div class="record-data">${data}</div>
                </div>
              `;
                })
                .join("");
      }
    } catch (error) {
      const statusEl = document.getElementById("status");
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = "status error";
    }
  }

  // Check auth on load
  checkAuth();

  // Poll every 2 seconds
  fetchStream();
  setInterval(fetchStream, 2000);
})();
