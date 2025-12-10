/**
 * Handler Wrapper Utilities
 * Wraps handlers with auth and validation logic
 */

import {
  Universe,
  ScratchContext,
  ScratchBlock,
  ScratchEndpointDefinition,
  JsonSchema,
  JsonSchemaValidator,
  UniverseModule,
} from "../../core/index";
import { IncomingMessage, ServerResponse } from "node:http";

export interface HandlerWrapperOptions {
  universe: Universe;
  endpoint: ScratchEndpointDefinition;
  noAuth?: boolean;
  requiredModules?: UniverseModule[];
}

/**
 * Wraps a handler with authentication and validation
 */
export async function wrapHandlerWithAuthAndValidation(
  options: HandlerWrapperOptions
): Promise<
  (
    context: ScratchContext,
    query?: Record<string, string>,
    requestBody?: any,
    authHeader?: string
  ) => Promise<any>
> {
  const { universe, endpoint, noAuth = false, requiredModules = [] } = options;

  // Get the block definition to extract schema
  const blockDef = await endpoint.block({});
  const schema = blockDef.schema;

  // Create the wrapped handler
  return async (
    context: ScratchContext,
    query: Record<string, string> = {},
    requestBody: any = undefined,
    authHeader: string | undefined = undefined
  ) => {
    // Auth check
    if (!noAuth) {
      if (!universe.auth.isConfigured()) {
        throw new Error("JWT authentication not configured");
      }

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid authorization header");
      }

      const token = authHeader.substring(7);
      try {
        const payload = await universe.auth.validateJwtToken(token);
        if (!payload) {
          throw new Error("Invalid or expired token");
        }
      } catch {
        throw new Error("Invalid or expired token");
      }
    }

    // Extract user email from auth header if present
    let userEmail: string | undefined;
    try {
      if (authHeader?.startsWith("Bearer ")) {
        const payload = await universe.auth.validateJwtToken(
          authHeader.substring(7)
        );
        if (payload) userEmail = (payload as any)?.email;
      }
    } catch {}

    // Update context with user email and ensure universe is set
    const enrichedContext: ScratchContext = {
      ...context,
      userEmail,
      universe: universe,
    };

    // Module validation
    if (requiredModules.length > 0) {
      const missingModules = requiredModules.filter(
        (module) => !universe.hasModule(module)
      );
      if (missingModules.length > 0) {
        throw new Error(
          `Required modules not available: ${missingModules.join(", ")}`
        );
      }
    }

    // Schema validation
    if (schema) {
      const validator =
        universe?.jsonSchemaValidator || new JsonSchemaValidator();
      const fullSchema = constructJsonSchema(schema);
      const isGet = blockDef.blockType === "reporter";

      // For GET requests, query params go directly into inputs
      // For POST requests, request body goes into inputs
      let data: any = isGet
        ? Object.fromEntries(
            Object.keys(schema).map((key) => [key, query[key] || undefined])
          )
        : requestBody || {};

      // Handle JSON type properties
      if (schema) {
        for (const [key, propSchema] of Object.entries(schema)) {
          if (
            propSchema.type === "json" &&
            data[key] !== undefined &&
            data[key] !== null &&
            data[key] !== ""
          ) {
            try {
              const parsed = JSON.parse(data[key]);
              if (propSchema.schema) {
                const wrappedSchema: JsonSchema = {
                  type: "object",
                  properties: { value: propSchema.schema },
                  required: ["value"],
                };
                const result = validator.validate(wrappedSchema, {
                  value: parsed,
                });
                if (!result.valid) {
                  throw new Error(
                    `Validation failed for ${key}: ${JSON.stringify(
                      result.errors
                    )}`
                  );
                }
                data[key] = result.data?.value ?? parsed;
              } else {
                data[key] = parsed;
              }
            } catch (parseError) {
              throw new Error(
                `Invalid JSON for ${key}: ${
                  parseError instanceof Error
                    ? parseError.message
                    : "Unknown error"
                }`
              );
            }
          }
        }
      }

      // Validate the data
      const dataForValidation: any = { ...data };
      if (schema) {
        for (const [key, propSchema] of Object.entries(schema)) {
          if (
            propSchema.type === "json" &&
            dataForValidation[key] !== undefined
          )
            delete dataForValidation[key];
        }
      }

      const result = validator.validate(fullSchema, dataForValidation);
      if (!result.valid) {
        throw new Error(`Validation failed: ${JSON.stringify(result.errors)}`);
      }

      const finalData = { ...result.data };
      if (schema) {
        for (const [key, propSchema] of Object.entries(schema)) {
          if (propSchema.type === "json" && data[key] !== undefined)
            finalData[key] = data[key];
        }
      }

      enrichedContext.inputs = finalData;
    } else {
      // For endpoints without schema, set empty inputs
      enrichedContext.inputs = {};
    }

    // Call the original handler
    return await endpoint.handler(enrichedContext);
  };
}

function constructJsonSchema(schema?: ScratchBlock["schema"]): JsonSchema {
  if (!schema)
    return {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    };
  const properties: any = {};
  const required: string[] = [];
  for (const [key, propSchema] of Object.entries(schema)) {
    if (propSchema.type === "json") {
      if (!propSchema.schema)
        throw new Error(
          `Property ${key} has type "json" but no schema provided`
        );
      properties[key] = {
        type: "string",
        description: propSchema.description,
        _jsonSchema: propSchema.schema,
      };
    } else {
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
