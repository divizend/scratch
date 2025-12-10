import { ScratchEndpointDefinition } from "../../core";
import { marked } from "marked";
import { join } from "node:path";
import { cwd } from "node:process";

export const root: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "root",
    blockType: "reporter",
    text: "root (README)",
  }),
  handler: async (context) => {
    try {
      // Try multiple possible paths for README.md
      const projectRoot = cwd();
      const possiblePaths = [
        join(projectRoot, "README.md"),
        join(process.cwd(), "README.md"),
        "README.md",
      ];

      let readme: string | null = null;
      for (const readmePath of possiblePaths) {
        try {
          const file = Bun.file(readmePath);
          if (await file.exists()) {
            readme = await file.text();
            break;
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      if (!readme) {
        return new Response("README.md not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }

      let html = await marked(readme);

      // Add target="_blank" and rel="noopener noreferrer" to all links
      html = html.replace(/<a\s+([^>]*?)>/gi, (match, attributes) => {
        // Check if target is already set
        if (!/target\s*=/i.test(attributes)) {
          attributes += ' target="_blank" rel="noopener noreferrer"';
        }
        return `<a ${attributes}>`;
      });

      // Process images: make them responsive by default and support width parameter
      html = html.replace(/<img\s+([^>]*?)>/gi, (match, attributes) => {
        // Extract src attribute
        const srcMatch = attributes.match(/src\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch) {
          return match; // Return original if no src found
        }

        let src = srcMatch[1];
        let width: string | null = null;
        let style = "max-width: 100%; height: auto;";

        // Check for width parameter in URL query string (e.g., ?width=500)
        const urlMatch = src.match(/^([^?]+)(\?.*)?$/);
        if (urlMatch) {
          const baseUrl = urlMatch[1];
          const queryString = urlMatch[2] || "";
          const urlParams = new URLSearchParams(queryString);

          if (urlParams.has("width")) {
            width = urlParams.get("width");
            // Remove width from query string to get clean URL
            urlParams.delete("width");
            const newQuery = urlParams.toString();
            src = newQuery ? `${baseUrl}?${newQuery}` : baseUrl;
          }
        }

        // Update src attribute
        attributes = attributes.replace(
          /src\s*=\s*["'][^"']+["']/i,
          `src="${src}"`
        );

        // Add or update style attribute
        if (width) {
          style = `max-width: 100%; width: ${width}px; height: auto;`;
        }

        // Check if style attribute already exists
        if (/style\s*=/i.test(attributes)) {
          attributes = attributes.replace(
            /style\s*=\s*["']([^"']*)["']/i,
            (m, existingStyle) => {
              return `style="${existingStyle}; ${style}"`;
            }
          );
        } else {
          attributes += ` style="${style}"`;
        }

        return `<img ${attributes}>`;
      });

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
    img { max-width: 100%; height: auto; display: block; margin: 20px auto; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

      return new Response(styledHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      return new Response("README.md not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
  noAuth: true,
};
