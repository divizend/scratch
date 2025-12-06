import { Hono } from "hono";
import { jwtAuth } from "./auth";
import {
  Universe,
  UniverseModule,
  JsonSchema,
  JsonSchemaValidator,
} from "../core";

export interface ScratchBlock {
  opcode: string;
  blockType: "command" | "reporter" | "boolean" | "hat";
  text: string;
  schema?: {
    [key: string]: {
      type: "string" | "number" | "boolean" | "array" | "object";
      default?: any;
      description?: string;
      [key: string]: any; // Allow additional JSON schema properties
    };
  };
}

export interface ScratchContext {
  userEmail?: string;
  validatedBody?: any; // Validated request body (set after validation middleware)
  universe?: Universe | null; // Universe instance (set by context middleware)
  // Add any other context properties that should be shared between block and handler
}

export interface ScratchEndpoint {
  opcode: string;
  block: (context: ScratchContext) => Promise<ScratchBlock>;
  endpoint: string;
  noAuth?: boolean;
}

export interface ScratchEndpointDefinition {
  block: (context: ScratchContext) => Promise<ScratchBlock>;
  handler: (context: ScratchContext) => Promise<any>;
  noAuth?: boolean;
  /** Array of required Universe modules that must be initialized before handler execution */
  requiredModules?: UniverseModule[];
}

// Registry of Scratch endpoints
export const scratchEndpoints: ScratchEndpoint[] = [];

// Get all registered endpoints
export function getRegisteredEndpoints(): ScratchEndpoint[] {
  return [...scratchEndpoints];
}

// Helper function to construct full JSON schema from properties
function constructJsonSchema(schema?: ScratchBlock["schema"]): JsonSchema {
  // Determine required fields (all fields are required by default)
  const required: string[] = schema ? Object.keys(schema) : [];

  return {
    type: "object",
    properties: schema || {},
    required,
    additionalProperties: false,
  };
}

// Helper function to generate Scratch arguments from schema properties
function generateArgumentsFromSchema(schema?: ScratchBlock["schema"]): {
  [key: string]: {
    type: "string" | "number" | "boolean";
    defaultValue?: string | number | boolean;
  };
} {
  const arguments_: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      defaultValue?: string | number | boolean;
    };
  } = {};

  if (schema) {
    for (const [key, propSchema] of Object.entries(schema)) {
      // Map JSON schema types to Scratch argument types
      let scratchType: "string" | "number" | "boolean" = "string";
      if (propSchema.type === "number") {
        scratchType = "number";
      } else if (propSchema.type === "boolean") {
        scratchType = "boolean";
      } else if (propSchema.type === "array" || propSchema.type === "object") {
        // Arrays and objects are represented as strings in Scratch (JSON strings)
        scratchType = "string";
      }

      arguments_[key] = {
        type: scratchType,
        defaultValue: propSchema.default,
      };
    }
  }

  return arguments_;
}

// Validation middleware that checks request body against JSON schema
function validateArguments(block: ScratchBlock) {
  return async (c: any, next: any) => {
    try {
      // Construct full JSON schema from properties
      const fullSchema = constructJsonSchema(block.schema);

      // For GET requests (reporter blocks), get params from query string
      // For POST requests (command blocks), get from body
      const isGet = c.req.method === "GET";
      let data: any = {};

      if (isGet) {
        // For GET, get all query params from schema properties
        const query = c.req.query();
        if (block.schema) {
          data = Object.fromEntries(
            Object.keys(block.schema).map((key) => [
              key,
              query[key] !== undefined ? query[key] : undefined,
            ])
          );
        }
      } else {
        try {
          data = await c.req.json();
        } catch {
          data = {};
        }
      }

      // Use Universe's JSON schema validator
      const { getUniverse } = await import("./universe");
      const universe = getUniverse();
      const validator =
        universe?.jsonSchemaValidator || new JsonSchemaValidator();

      const result = validator.validate(fullSchema, data);

      if (!result.valid) {
        return c.json(
          {
            error: "Validation failed",
            errors: result.errors,
          },
          400
        );
      }

      // Attach validated body to context for use in handler
      c.validatedBody = result.data || {};
      return next();
    } catch (error) {
      return c.json({ error: "Invalid request" }, 400);
    }
  };
}

// Helper function to register a Scratch endpoint
// Automatically generates endpoint path as /api/{opcode}
// Uses GET for reporter blocks, POST for command blocks
// Automatically applies JWT auth (unless noAuth is true), argument validation, try-catch, and JSON response
export async function registerScratchEndpoint(
  app: Hono,
  {
    block,
    handler,
    noAuth = false,
    requiredModules = [],
  }: {
    block: (context: ScratchContext) => Promise<ScratchBlock>;
    handler: (context: ScratchContext) => Promise<any>;
    noAuth?: boolean;
    requiredModules?: UniverseModule[];
  }
) {
  // Build middleware array conditionally
  const middlewares: Array<(c: any, next?: any) => Promise<any> | any> = [];

  // Create context extraction middleware
  const contextMiddleware = async (c: any, next: any) => {
    // Extract user email from JWT if available (always try, even if noAuth is true)
    // Fail silently if token is invalid or missing
    let userEmail: string | undefined;
    try {
      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const { validateJwtToken } = await import("./auth");
        const payload = await validateJwtToken(token);
        if (payload) {
          userEmail = (payload as any)?.email;
        }
      }
    } catch (error) {
      // Ignore errors, userEmail will remain undefined
    }

    // Get universe instance
    const { getUniverse } = await import("./universe");
    const universe = getUniverse();

    // Create context
    const context: ScratchContext = { userEmail, universe };
    c.scratchContext = context;

    // Get block definition from function (await since it returns a Promise)
    const blockDef = await block(context);
    c.scratchBlock = blockDef;

    await next();
  };

  if (!noAuth) {
    middlewares.push(jwtAuth);
  }
  middlewares.push(contextMiddleware);

  // Module validation middleware - ensures universe is available and required modules are initialized
  const moduleValidationMiddleware = async (c: any, next: any) => {
    const context = c.scratchContext;

    // First check if universe is available
    if (!context.universe) {
      return c.json(
        {
          error: "Universe not initialized",
        },
        503
      );
    }

    // Then check if required modules are available
    if (requiredModules.length > 0) {
      const missingModules = requiredModules.filter(
        (module) => !context.universe!.hasModule(module)
      );
      if (missingModules.length > 0) {
        return c.json(
          {
            error: `Required modules not available: ${missingModules.join(
              ", "
            )}`,
            missingModules: missingModules,
          },
          503
        );
      }
    }

    await next();
  };
  middlewares.push(moduleValidationMiddleware);

  // Create validation middleware that uses the block from context
  const validationMiddleware = async (c: any, next: any) => {
    const blockDef = c.scratchBlock;

    // Call validation middleware - it will return a Response if validation fails
    // We need to wrap next() to add validatedBody to context after validation passes
    const result = await validateArguments(blockDef)(c, async () => {
      // Validation passed - add validatedBody to context before continuing
      c.scratchContext.validatedBody = c.validatedBody;
      await next();
    });

    // If validation failed, validateArguments returned a Response - return it to stop the chain
    // If validation passed, result will be undefined (next() was called) and we continue
    return result;
  };
  middlewares.push(validationMiddleware);

  // Wrap handler with automatic error handling and JSON response
  const wrappedHandler = async (c: any) => {
    try {
      // Pass the complete context to handler (includes userEmail and validatedBody)
      const context = c.scratchContext;
      const result = await handler(context);
      // If handler returns a Response, use it directly
      if (result instanceof Response) {
        return result;
      }
      // If handler returns a string, return as plain text
      if (typeof result === "string") {
        return c.text(result);
      }
      // Arrays and objects should always be returned as JSON
      // (result || { success: true }) handles null/undefined but arrays are truthy
      if (result === null || result === undefined) {
        return c.json({ success: true });
      }
      // Otherwise, wrap in JSON response (handles arrays, objects, etc.)
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  };
  middlewares.push(wrappedHandler);

  // Get block definition to determine method and endpoint
  // Use a default context to get the opcode (await since block returns a Promise)
  const defaultContext: ScratchContext = {};
  const blockDef = await block(defaultContext);
  const endpoint = `/api/${blockDef.opcode}`;
  const method = blockDef.blockType === "reporter" ? "get" : "post";

  // Store endpoint info - store the block function so it can be resolved with user context later
  scratchEndpoints.push({
    opcode: blockDef.opcode,
    block: block,
    endpoint,
    noAuth,
  });

  // Register the route with Hono
  app[method](endpoint, ...middlewares);
}

// Helper function to register multiple Scratch endpoints at once
export async function registerScratchEndpoints(
  app: Hono,
  endpoints: ScratchEndpointDefinition[]
) {
  await Promise.all(
    endpoints.map((endpoint) =>
      registerScratchEndpoint(app, {
        block: endpoint.block,
        handler: endpoint.handler,
        noAuth: endpoint.noAuth,
        requiredModules: endpoint.requiredModules,
      })
    )
  );
}
