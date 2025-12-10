import { ScratchEndpointDefinition } from "../../core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const admin: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "admin",
    blockType: "reporter",
    text: "admin interface",
  }),
  handler: async (context) => {
    try {
      const templatePath = join(process.cwd(), "public", "admin", "index.html");
      const html = readFileSync(templatePath, "utf-8");
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin Interface</title>
</head>
<body>
  <h1>Admin Interface</h1>
  <p>Admin interface not found. Please ensure public/admin/index.html exists.</p>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
  noAuth: true,
};
