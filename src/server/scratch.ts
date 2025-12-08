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

// Helper function to generate default value from JSON schema property
function generateDefaultFromSchema(propSchema: any): any {
  if (propSchema.default !== undefined) {
    return propSchema.default;
  }

  switch (propSchema.type) {
    case "object":
      const obj: any = {};
      if (propSchema.properties) {
        for (const [key, nestedSchema] of Object.entries(
          propSchema.properties
        )) {
          obj[key] = generateDefaultFromSchema(nestedSchema);
        }
      }
      return obj;
    case "array":
      return [];
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return null;
  }
}

// Helper function to construct full JSON schema from properties
function constructJsonSchema(schema?: ScratchBlock["schema"]): JsonSchema {
  if (!schema) {
    return {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    };
  }

  const properties: any = {};
  const required: string[] = [];

  for (const [key, propSchema] of Object.entries(schema)) {
    if (propSchema.type === "json") {
      // For JSON type, use the provided schema and validate/parse the JSON string
      if (!propSchema.schema) {
        throw new Error(
          `Property ${key} has type "json" but no schema provided`
        );
      }
      // Store the JSON schema for validation, but the actual property type is string (JSON string)
      properties[key] = {
        type: "string",
        description: propSchema.description,
        // Store the JSON schema in a custom property for validation
        _jsonSchema: propSchema.schema,
      };
      // Don't add JSON fields to required - they're validated separately before main validation
    } else {
      // For other types, use the property schema directly
      properties[key] = propSchema;
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
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
      let defaultValue: any = propSchema.default;

      if (propSchema.type === "number") {
        scratchType = "number";
      } else if (propSchema.type === "boolean") {
        scratchType = "boolean";
      } else if (propSchema.type === "array" || propSchema.type === "object") {
        // Arrays and objects are represented as strings in Scratch (JSON strings)
        scratchType = "string";
        if (defaultValue === undefined) {
          defaultValue = propSchema.type === "array" ? "[]" : "{}";
        } else if (typeof defaultValue !== "string") {
          defaultValue = JSON.stringify(defaultValue);
        }
      } else if (propSchema.type === "json") {
        // JSON type is always a string in Scratch (JSON string)
        scratchType = "string";
        // Generate default from the JSON schema if not provided
        if (defaultValue === undefined && propSchema.schema) {
          const generatedDefault = generateDefaultFromSchema(propSchema.schema);
          defaultValue = JSON.stringify(generatedDefault);
        } else if (
          defaultValue !== undefined &&
          typeof defaultValue !== "string"
        ) {
          defaultValue = JSON.stringify(defaultValue);
        }
      }

      arguments_[key] = {
        type: scratchType,
        defaultValue,
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

      // Pre-process JSON type fields: parse JSON strings and validate against their schemas
      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
          if (
            propSchema.type === "json" &&
            data[key] !== undefined &&
            data[key] !== null &&
            data[key] !== ""
          ) {
            try {
              // Parse the JSON string
              const parsed = JSON.parse(data[key]);

              // Validate against the JSON schema if provided
              if (propSchema.schema) {
                // Wrap the property schema in an object schema for validation
                const wrappedSchema: JsonSchema = {
                  type: "object",
                  properties: {
                    value: propSchema.schema,
                  },
                  required: ["value"],
                };
                const jsonSchemaResult = validator.validate(wrappedSchema, {
                  value: parsed,
                });

                if (!jsonSchemaResult.valid) {
                  return c.json(
                    {
                      error: `Validation failed for ${key}`,
                      errors: jsonSchemaResult.errors,
                    },
                    400
                  );
                }

                // Use the validated value
                data[key] = jsonSchemaResult.data?.value ?? parsed;
              } else {
                // No schema provided, just use parsed value
                data[key] = parsed;
              }
            } catch (parseError) {
              return c.json(
                {
                  error: `Invalid JSON for ${key}: ${
                    parseError instanceof Error
                      ? parseError.message
                      : "Unknown error"
                  }`,
                },
                400
              );
            }
          }
        }
      }

      // For JSON type fields, we've already parsed and validated them
      // Skip them in the main schema validation to avoid type conflicts
      const dataForValidation: any = { ...data };
      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
          if (
            propSchema.type === "json" &&
            dataForValidation[key] !== undefined
          ) {
            // JSON fields are already parsed, so we need to mark them as validated
            // The validator expects strings, but we've already converted them to objects
            // So we'll validate everything else, then merge the JSON fields back
            delete dataForValidation[key];
          }
        }
      }

      const result = validator.validate(fullSchema, dataForValidation);

      if (!result.valid) {
        return c.json(
          {
            error: "Validation failed",
            errors: result.errors,
          },
          400
        );
      }

      // Merge validated data with parsed JSON fields
      const finalData = { ...result.data };
      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
          if (propSchema.type === "json" && data[key] !== undefined) {
            // Use the already-parsed JSON value
            finalData[key] = data[key];
          }
        }
      }

      // Attach validated body to context for use in handler
      c.validatedBody = finalData;
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

    // Create context - include Hono context for access to request/response
    const context: ScratchContext & { c?: any; query?: any } = { 
      userEmail, 
      universe,
      c, // Pass Hono context for access to request/response
      query: c.req.query(), // Extract query parameters
    };
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
      // Note: For HTML content, handlers should return a Response with Content-Type: text/html
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
  const endpoint = `/${blockDef.opcode}`;
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
