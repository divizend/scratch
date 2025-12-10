/**
 * BASIC Compiler Module
 * Compiles BASIC code to TypeScript endpoint definitions
 */

interface SchemaDefinition {
  [key: string]: {
    type: "string" | "number" | "boolean" | "array" | "object" | "json";
    default?: any;
    description?: string;
    schema?: any;
    [key: string]: any;
  };
}

/**
 * Parses BASIC values to TypeScript expressions
 * Passes through expressions 1:1 without parsing
 */
class ValueParser {
  parse(value: string): string {
    // Pass through the value as-is, character by character
    return value.trim();
  }
}

/**
 * Parses BASIC conditions to TypeScript conditions
 * Passes through conditions 1:1 without parsing
 */
class ConditionParser {
  parse(condition: string): string {
    // Pass through the condition as-is, character by character
    return condition.trim();
  }
}

/**
 * Parses call arguments from BASIC call statements
 */
class CallArgsParser {
  parse(callExpr: string): string[] {
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
}

/**
 * Generates schema from text and optional schema definition
 */
class SchemaGenerator {
  /**
   * Extracts parameter names from text (e.g., "do something [param1] with [param2]")
   */
  private extractParameterNames(text: string): string[] {
    const matches = text.match(/\[([^\]]+)\]/g);
    if (!matches) return [];
    return matches.map((match) => match.slice(1, -1));
  }

  /**
   * Generates default schema from parameter names
   */
  private generateDefaultSchema(parameterNames: string[]): SchemaDefinition {
    const schema: SchemaDefinition = {};
    for (const paramName of parameterNames) {
      schema[paramName] = {
        type: "string",
        default: `[${paramName}]`,
      };
    }
    return schema;
  }

  /**
   * Parses schema from comment line (JSON format)
   */
  private parseSchemaComment(commentLine: string): SchemaDefinition | null {
    try {
      // Remove # and trim
      const jsonStr = commentLine.replace(/^#\s*/, "").trim();
      if (!jsonStr) return null;
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  /**
   * Merges default schema with optional schema
   */
  private mergeSchemas(
    defaultSchema: SchemaDefinition,
    optionalSchema: SchemaDefinition | null
  ): SchemaDefinition {
    if (!optionalSchema) return defaultSchema;

    const merged = { ...defaultSchema };
    for (const [key, value] of Object.entries(optionalSchema)) {
      merged[key] = { ...defaultSchema[key], ...value };
    }
    return merged;
  }

  /**
   * Generates schema from text and optional schema comment
   */
  generate(text: string, schemaComment?: string): SchemaDefinition {
    const parameterNames = this.extractParameterNames(text);
    const defaultSchema = this.generateDefaultSchema(parameterNames);
    const optionalSchema = schemaComment
      ? this.parseSchemaComment(schemaComment)
      : null;
    return this.mergeSchemas(defaultSchema, optionalSchema);
  }
}

/**
 * Parses BASIC statements and converts them to TypeScript
 */
class BasicParser {
  private valueParser: ValueParser;
  private conditionParser: ConditionParser;
  private callArgsParser: CallArgsParser;
  private statements: string[] = [];
  private indent: number = 4;
  private hasReturn: boolean = false;
  private variables: Set<string> = new Set();

  constructor() {
    this.valueParser = new ValueParser();
    this.conditionParser = new ConditionParser();
    this.callArgsParser = new CallArgsParser();
  }

  parse(lines: string[]): string {
    this.statements = [];
    this.indent = 4;
    this.hasReturn = false;
    this.variables.clear();

    for (const line of lines) {
      this.parseLine(line.trim());
    }

    // Add default return if none provided
    if (!this.hasReturn) {
      this.statements.push(
        `${" ".repeat(this.indent)}return { success: true };`
      );
    }

    const handlerBody =
      this.statements.length > 0
        ? this.statements.join("\n")
        : "    return { success: true };";

    // Replace $ with context (but not inside strings)
    return this.replaceDollarSignWithContext(handlerBody);
  }

  /**
   * Replaces $ with context in the generated code, but preserves $ inside strings
   */
  private replaceDollarSignWithContext(code: string): string {
    let result = "";
    let inString = false;
    let stringChar = "";
    let i = 0;

    while (i < code.length) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : "";

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          result += char;
          i++;
        } else if (char === "$") {
          // Check what follows $
          const nextChar = i + 1 < code.length ? code[i + 1] : "";

          if (nextChar === ".") {
            // $.property -> context.property
            result += "context";
            i++;
          } else if (/[a-zA-Z_$]/.test(nextChar)) {
            // $property -> context.property
            result += "context.";
            i++;
          } else {
            // $ alone or $ followed by non-identifier -> context
            result += "context";
            i++;
          }
        } else {
          result += char;
          i++;
        }
      } else {
        result += char;
        if (char === stringChar && prevChar !== "\\") {
          inString = false;
        }
        i++;
      }
    }

    return result;
  }

  private parseLine(trimmed: string): void {
    // Variable assignment: x = value
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*/.test(trimmed)) {
      this.parseAssignment(trimmed);
    }
    // While loop: while condition
    else if (trimmed.startsWith("while ")) {
      this.parseWhile(trimmed);
    }
    // End (closes while/if)
    else if (trimmed === "end") {
      this.parseEnd();
    }
    // If statement: if condition
    else if (trimmed.startsWith("if ")) {
      this.parseIf(trimmed);
    }
    // Else
    else if (trimmed === "else") {
      this.parseElse();
    }
    // Return statement: return value
    else if (trimmed.startsWith("return ")) {
      this.parseReturn(trimmed);
    }
    // Endpoint call: call endpointName arg1 arg2 ...
    else if (trimmed.startsWith("call ")) {
      this.parseCall(trimmed);
    }
    // Unknown
    else {
      throw new Error(`Unknown statement: ${trimmed}`);
    }
  }

  private parseAssignment(trimmed: string): void {
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (match) {
      const varName = match[1];
      const value = match[2];
      this.variables.add(varName);
      const tsValue = this.valueParser.parse(value);
      const isFirstUse = !this.statements.some((s) =>
        s.includes(`${varName} =`)
      );
      const decl = isFirstUse ? "let " : "";
      this.statements.push(
        `${" ".repeat(this.indent)}${decl}${varName} = ${tsValue};`
      );
    }
  }

  private parseWhile(trimmed: string): void {
    const condition = trimmed.substring(6).trim();
    const tsCondition = this.conditionParser.parse(condition);
    this.statements.push(`${" ".repeat(this.indent)}while (${tsCondition}) {`);
    this.indent += 2;
  }

  private parseEnd(): void {
    this.indent = Math.max(4, this.indent - 2);
    this.statements.push(`${" ".repeat(this.indent)}}`);
  }

  private parseIf(trimmed: string): void {
    const condition = trimmed.substring(3).trim();
    const tsCondition = this.conditionParser.parse(condition);
    this.statements.push(`${" ".repeat(this.indent)}if (${tsCondition}) {`);
    this.indent += 2;
  }

  private parseElse(): void {
    this.indent = Math.max(4, this.indent - 2);
    this.statements.push(`${" ".repeat(this.indent)}} else {`);
    this.indent += 2;
  }

  private parseReturn(trimmed: string): void {
    const value = trimmed.substring(7).trim();
    const tsValue = this.valueParser.parse(value);
    this.statements.push(`${" ".repeat(this.indent)}return ${tsValue};`);
    this.hasReturn = true;
  }

  private parseCall(trimmed: string): void {
    const callExpr = trimmed.substring(5).trim();
    const parts = this.callArgsParser.parse(callExpr);
    if (parts.length === 0) {
      throw new Error(`Invalid call statement: ${trimmed}`);
    }
    const endpointName = parts[0];
    const args = parts.slice(1);

    // Parse arguments
    const parsedArgs = args.map((arg) => this.valueParser.parse(arg));
    const argsStr = parsedArgs.join(", ");

    // Use Universe.call() method for clean endpoint calling
    this.statements.push(
      `${" ".repeat(
        this.indent
      )}context.result = await context.universe!.call(context, "${endpointName}"${argsStr ? `, ${argsStr}` : ""});`
    );
  }
}

/**
 * Generates TypeScript code from parsed BASIC
 */
class TypeScriptGenerator {
  private schemaGenerator: SchemaGenerator;

  constructor() {
    this.schemaGenerator = new SchemaGenerator();
  }

  generate(
    opcode: string,
    text: string,
    schemaComment: string | undefined,
    handlerBody: string,
    basicCode: string
  ): string {
    const schema = this.schemaGenerator.generate(text, schemaComment);

    // Format schema as TypeScript object with proper indentation
    const schemaLines = JSON.stringify(schema, null, 2)
      .split("\n")
      .map((line, idx) => {
        if (idx === 0) return "    " + line;
        return "    " + line;
      })
      .join("\n");

    // Format BASIC code as a comment block
    const basicCodeComment = basicCode
      .split("\n")
      .map((line) => ` * ${line}`)
      .join("\n");

    return `/**
${basicCodeComment}
 */
import { ScratchEndpointDefinition } from "../src";

export const ${opcode}: ScratchEndpointDefinition = {
  block: async () => ({
    opcode: "${opcode}",
    blockType: "command",
    text: ${JSON.stringify(text)},
    schema: ${schemaLines},
  }),
  handler: async (context) => {
${handlerBody}
  },
};
`;
  }
}

/**
 * Main BASIC Compiler class
 */
export class BasicCompiler {
  private parser: BasicParser;
  private generator: TypeScriptGenerator;

  constructor() {
    this.parser = new BasicParser();
    this.generator = new TypeScriptGenerator();
  }

  /**
   * Compiles BASIC code to TypeScript endpoint definition
   * @param basicCode - BASIC source code (first line is text, optional second line is schema comment)
   * @param opcode - The opcode for the generated endpoint
   * @returns TypeScript source code for the endpoint
   */
  compile(basicCode: string, opcode: string): string {
    const lines = basicCode.split("\n").map((line) => line.trim());

    // Extract text from first line (mandatory)
    if (lines.length === 0) {
      throw new Error("BASIC code must have at least a text line");
    }

    let textLine = lines[0];
    let schemaComment: string | undefined;
    let codeStartIndex = 1;

    // First line must be the text (can be a comment starting with #)
    if (textLine.startsWith("#")) {
      textLine = textLine.substring(1).trim();
    }

    if (!textLine) {
      throw new Error("First line must contain the endpoint text");
    }

    // Second line (optional) can be a schema comment
    if (lines.length > 1 && lines[1].startsWith("#")) {
      schemaComment = lines[1];
      codeStartIndex = 2;
    }

    // Parse the actual BASIC code (skip comments, but keep non-comment lines)
    const codeLines = lines
      .slice(codeStartIndex)
      .map((line) => {
        // Remove comments from code lines
        const commentIndex = line.indexOf("#");
        if (commentIndex >= 0) {
          return line.substring(0, commentIndex).trim();
        }
        return line.trim();
      })
      .filter((line) => line.length > 0);

    // Parse BASIC code to TypeScript
    const handlerBody = this.parser.parse(codeLines);

    // Generate TypeScript
    return this.generator.generate(
      opcode,
      textLine,
      schemaComment,
      handlerBody,
      basicCode
    );
  }
}

/**
 * Convenience function for backward compatibility
 */
export function compileBasicToTypeScript(
  basicCode: string,
  opcode: string
): string {
  const compiler = new BasicCompiler();
  return compiler.compile(basicCode, opcode);
}
