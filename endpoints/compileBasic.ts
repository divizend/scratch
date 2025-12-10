import { ScratchEndpointDefinition } from "../src";

export const compileBasic: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "compileBasic",
    blockType: "reporter",
    text: "compile BASIC code [code] to TypeScript endpoint [opcode]",
    schema: {
      code: {
        type: "string",
        default: `# Simple example
x = 0
while x < 5
  call appendToStream "test" {"count": x}
  x = x + 1
end
return x`,
        description: "BASIC code to compile",
      },
      opcode: {
        type: "string",
        default: "myEndpoint",
        description: "Opcode for the generated endpoint",
      },
    },
  }),
  handler: async (context) => {
    const code = (context as any).query?.code || "";
    const opcode = (context as any).query?.opcode || "myEndpoint";

    try {
      const typescript = compileBasicToTypeScript(code, opcode);
      return {
        success: true,
        typescript,
        message: "BASIC code compiled successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  },
};

function compileBasicToTypeScript(basicCode: string, opcode: string): string {
  const lines = basicCode
    .split("\n")
    .map((line) => {
      // Remove comments
      const commentIndex = line.indexOf("#");
      if (commentIndex >= 0) {
        return line.substring(0, commentIndex).trim();
      }
      return line.trim();
    })
    .filter((line) => line.length > 0);

  const variables = new Set<string>();
  const statements: string[] = [];
  let indent = 4;
  let hasReturn = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Variable assignment: x = value
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*/.test(trimmed)) {
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (match) {
        const varName = match[1];
        const value = match[2];
        variables.add(varName);
        const tsValue = parseValue(value);
        // Use let for first assignment, then just assignment
        const isFirstUse = !statements.some((s) => s.includes(`${varName} =`));
        const decl = isFirstUse ? "let " : "";
        statements.push(`${" ".repeat(indent)}${decl}${varName} = ${tsValue};`);
      }
    }
    // While loop: while condition
    else if (trimmed.startsWith("while ")) {
      const condition = trimmed.substring(6).trim();
      const tsCondition = parseCondition(condition);
      statements.push(`${" ".repeat(indent)}while (${tsCondition}) {`);
      indent += 2;
    }
    // End (closes while/if)
    else if (trimmed === "end") {
      indent = Math.max(4, indent - 2);
      statements.push(`${" ".repeat(indent)}}`);
    }
    // If statement: if condition
    else if (trimmed.startsWith("if ")) {
      const condition = trimmed.substring(3).trim();
      const tsCondition = parseCondition(condition);
      statements.push(`${" ".repeat(indent)}if (${tsCondition}) {`);
      indent += 2;
    }
    // Else
    else if (trimmed === "else") {
      indent = Math.max(4, indent - 2);
      statements.push(`${" ".repeat(indent)}} else {`);
      indent += 2;
    }
    // Return statement: return value
    else if (trimmed.startsWith("return ")) {
      const value = trimmed.substring(7).trim();
      const tsValue = parseValue(value);
      statements.push(`${" ".repeat(indent)}return ${tsValue};`);
      hasReturn = true;
    }
    // Endpoint call: call endpointName arg1 arg2 ...
    else if (trimmed.startsWith("call ")) {
      const callExpr = trimmed.substring(5).trim();
      const parts = parseCallArgs(callExpr);
      if (parts.length === 0) {
        throw new Error(`Invalid call statement: ${trimmed}`);
      }
      const endpointName = parts[0];
      const args = parts.slice(1);

      // Build arguments object - assume endpoint expects named parameters
      const argsObj: string[] = [];
      for (let j = 0; j < args.length; j++) {
        const arg = args[j];
        // Try to infer parameter name from common patterns
        const paramName =
          j === 0 && endpointName.includes("Stream")
            ? "streamName"
            : j === 0 && endpointName.includes("Email")
            ? "to"
            : j === 0
            ? "value"
            : `param${j}`;
        argsObj.push(`${paramName}: ${parseValue(arg)}`);
      }
      const argsStr = argsObj.length > 0 ? `{ ${argsObj.join(", ")} }` : "{}";

      statements.push(
        `${" ".repeat(
          indent
        )}const handler = await context.universe!.httpServer.getHandler("${endpointName}");`
      );
      statements.push(
        `${" ".repeat(
          indent
        )}if (handler) await handler({ ...context, validatedBody: ${argsStr} });`
      );
    }
    // Unknown - skip with warning
    else {
      throw new Error(`Unknown statement: ${trimmed}`);
    }
  }

  // Add default return if none provided
  if (!hasReturn) {
    statements.push(`${" ".repeat(4)}return { success: true };`);
  }

  const handlerBody =
    statements.length > 0
      ? statements.join("\n")
      : "    return { success: true };";

  return `import { ScratchEndpointDefinition } from "../src";

export const ${opcode}: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "${opcode}",
    blockType: "command",
    text: "${opcode}",
  }),
  handler: async (context) => {
${handlerBody}
  },
};
`;
}

function parseValue(value: string): string {
  value = value.trim();

  // String literal: "hello" or 'hello'
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }

  // Boolean
  if (value === "true" || value === "false") {
    return value;
  }

  // JSON object/array
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    return value;
  }

  // Variable reference
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    return value;
  }

  // Arithmetic expression: x + 1, x - 1, etc.
  if (/[+\-*/]/.test(value)) {
    return value.replace(/\s+/g, " ");
  }

  // Default: treat as string
  return JSON.stringify(value);
}

function parseCondition(condition: string): string {
  // Replace common operators
  condition = condition
    .replace(/\s+and\s+/gi, " && ")
    .replace(/\s+or\s+/gi, " || ")
    .replace(/\s+not\s+/gi, " !")
    .replace(/\s+=\s+/g, " === ")
    .replace(/\s+<>\s+/g, " !== ")
    .replace(/\s+<=\s+/g, " <= ")
    .replace(/\s+>=\s+/g, " >= ")
    .replace(/\s+<\s+/g, " < ")
    .replace(/\s+>\s+/g, " > ");

  return condition.trim();
}

function parseCallArgs(callExpr: string): string[] {
  const args: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let depth = 0;

  for (let i = 0; i < callExpr.length; i++) {
    const char = callExpr[i];

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === " " && depth === 0) {
        if (current.trim()) {
          args.push(current.trim());
          current = "";
        }
      } else {
        if (char === "{" || char === "[") depth++;
        if (char === "}" || char === "]") depth--;
        current += char;
      }
    } else {
      current += char;
      if (char === stringChar && callExpr[i - 1] !== "\\") {
        inString = false;
      }
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}
