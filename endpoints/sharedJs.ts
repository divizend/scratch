import { ScratchEndpointDefinition } from "@divizend/scratch-core";

export const sharedJs: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "sharedJs",
    blockType: "reporter",
    text: "shared JS",
  }),
  handler: async (context) => {
    const js = `// Shared JavaScript utilities for Admin Interface and Stream Viewer

(function() {
  // Token management
  window.getToken = function() {
    return localStorage.getItem("adminToken") || "";
  };

  window.setToken = function(token) {
    if (token) {
      localStorage.setItem("adminToken", token);
    } else {
      localStorage.removeItem("adminToken");
    }
  };

  // Get Authorization headers for fetch requests
  window.getAuthHeaders = function(additionalHeaders = {}) {
    const token = window.getToken();
    const headers = { ...additionalHeaders };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    return headers;
  };
})();
`;

    return new Response(js, {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  },
  noAuth: true,
};

