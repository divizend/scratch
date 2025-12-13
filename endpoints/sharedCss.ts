import { ScratchEndpointDefinition } from "@divizend/scratch-core";

export const sharedCss: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "sharedCss",
    blockType: "reporter",
    text: "shared CSS",
  }),
  handler: async (context) => {
    const css = `/* Shared CSS for Admin Interface and Stream Viewer */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
    sans-serif;
  padding: 20px;
  background: #f5f5f5;
}

h1 {
  margin-bottom: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

button:hover {
  background: #0256c2;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

button.secondary {
  background: #6c757d;
}

button.secondary:hover {
  background: #5a6268;
}

input[type="password"],
input[type="email"],
input[type="text"] {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
}

.status {
  margin: 10px 0;
  padding: 10px;
  border-radius: 4px;
}

.status.success {
  background: #d4edda;
  color: #155724;
}

.status.error {
  background: #f8d7da;
  color: #721c24;
}

.status.info {
  background: #d1ecf1;
  color: #0c5460;
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
`;

    return new Response(css, {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8" },
    });
  },
  noAuth: true,
};
