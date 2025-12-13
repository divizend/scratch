/**
 * Scratch - Type definitions for Scratch endpoint system
 */

import { Universe, UniverseModule } from "./Universe";

export interface ScratchBlock {
  opcode: string;
  blockType: "command" | "reporter" | "boolean" | "hat";
  text: string;
  schema?: {
    [key: string]: {
      type: "string" | "number" | "boolean" | "array" | "object" | "json";
      default?: any;
      description?: string;
      schema?: {
        // Property-level JSON schema (not full JsonSchema)
        type: "string" | "number" | "boolean" | "array" | "object";
        default?: any;
        items?: any;
        properties?: any;
        [key: string]: any;
      }; // Required when type is "json"
      [key: string]: any; // Allow additional JSON schema properties
    };
  };
}

export interface ScratchContext {
  userEmail?: string;
  inputs?: any; // Validated request body/query params (set after validation)
  universe?: Universe | null; // Universe instance (set by context middleware)
  authHeader?: string; // Authorization header for nested endpoint calls
  result?: any; // Result from nested endpoint calls
  requestHost?: string; // Request host header (e.g., "localhost:3000" or "scratch.divizend.ai")
}

export interface ScratchEndpointDefinition {
  block: (context: ScratchContext) => Promise<ScratchBlock>;
  handler: (context: ScratchContext) => Promise<any>;
  noAuth?: boolean;
  /** Array of required Universe modules that must be initialized before handler execution */
  requiredModules?: UniverseModule[];
}
