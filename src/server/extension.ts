import { Hono } from "hono";
import { validateJwtToken } from "./auth";
import { scratchEndpoints, ScratchContext } from "./scratch";

// Helper function to convert email to hyphenated name (e.g., "julian.nalenz@divizend.com" -> "julian-nalenz")
function emailToHyphenatedName(email: string): string {
  const localPart = email.split("@")[0];
  return localPart.replace(/\./g, "-");
}

// Helper function to convert hyphenated string to PascalCase
function hyphenatedToPascalCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

// Helper function to convert hyphenated string to Title Case
function toTitleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Generate extension ID and name from hyphenated name
function generateExtensionInfo(name: string) {
  const orgName = process.env.ORG_NAME || "divizend";
  const orgNamePascal = orgName.charAt(0).toUpperCase() + orgName.slice(1);
  const namePascal = hyphenatedToPascalCase(name);
  const nameTitle = toTitleCase(name);

  return {
    id: `${orgNamePascal}${namePascal}`,
    displayName: `${orgNamePascal} (${nameTitle})`,
  };
}

// Determine the base URL for the extension based on whether we're running locally
function getBaseUrl(c: any): string {
  const host = c.req.header("host") || "";
  const port = process.env.PORT || 3000;
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("::1") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  if (isLocal) {
    return `http://localhost:${port}`;
  }

  const HOSTED_AT = process.env.HOSTED_AT || "scratch.divizend.ai";
  // Use HOSTED_AT, ensuring it has a protocol
  const hostedAt = HOSTED_AT.startsWith("http")
    ? HOSTED_AT
    : `https://${HOSTED_AT}`;
  return hostedAt;
}

// Register extension source endpoint
export function registerExtensionEndpoint(app: Hono) {
  app.get("*", async (c, next) => {
    const path = c.req.path;

    // Only handle paths that match /extension/{jwt}.js pattern (not admin, api, etc.)
    // JWT tokens contain base64url characters: a-z, A-Z, 0-9, -, _, and dots
    const match = path.match(/^\/extension\/([A-Za-z0-9\-_\.]+)\.js$/);

    if (!match) {
      return next();
    }

    const jwtToken = match[1];

    // Validate JWT token
    const payload = await validateJwtToken(jwtToken);
    if (!payload) {
      return c.text("Invalid or expired JWT token", 401);
    }

    // Extract email from JWT payload
    const email = (payload as any)?.email;
    if (!email || typeof email !== "string") {
      return c.text("JWT token does not contain a valid email address", 400);
    }

    // Convert email to hyphenated name (e.g., "julian.nalenz@divizend.com" -> "julian-nalenz")
    const name = emailToHyphenatedName(email);

    // Generate extension ID and name from the email-derived name
    const { id: extensionId, displayName: extensionName } =
      generateExtensionInfo(name);

    // Determine the base URL for this request
    const baseUrl = getBaseUrl(c);

    // Create context with user email
    const context: ScratchContext = { userEmail: email };

    // Generate the Scratch extension class
    // Resolve dynamic blocks using the context
    const resolvedEndpoints = scratchEndpoints.map((ep) => {
      // Call block function with context to get resolved block
      const block = ep.block(context);
      return { ...ep, block };
    });

    const blocks = resolvedEndpoints.map((ep) => ep.block);
    const methods = resolvedEndpoints
      .map((ep) => {
        const params = Object.keys(ep.block.arguments);
        const paramList = params.join(", ");
        const isGet = ep.block.blockType === "reporter";

        let fetchCode = "";
        if (isGet) {
          // GET request with query parameters
          const queryParams =
            params.length > 0
              ? `?${params
                  .map((p) => `${p}=" + encodeURIComponent(${p})`)
                  .join("&")}`
              : "";
          fetchCode = `    return fetch("${baseUrl}${ep.endpoint}${queryParams}", {
      method: "GET",
      headers: {
        "Authorization": "Bearer ${jwtToken}",
      }
    }).then((response) => response.text());`;
        } else {
          // POST request with body
          const fetchBody =
            params.length > 0
              ? `body: JSON.stringify({ ${params
                  .map((p) => `${p}`)
                  .join(", ")} })`
              : "";
          fetchCode = `    return fetch("${baseUrl}${ep.endpoint}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ${jwtToken}",
      }${fetchBody ? `,\n      ${fetchBody}` : ""}
    }).then((response) => response.text());`;
        }

        return `  ${ep.opcode}({ ${paramList} }) {
${fetchCode}
  }`;
      })
      .join("\n\n");

    const extensionCode = `class ${extensionId} {
  constructor() {}

  getInfo() {
    return {
      id: "${extensionId}",
      name: "${extensionName}",
      blocks: ${JSON.stringify(blocks, null, 2)},
    };
  }

${methods}
}

Scratch.extensions.register(new ${extensionId}());`;

    return c.text(extensionCode, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  });
}
