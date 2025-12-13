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

// Type alias for schema property values
type SchemaProperty = NonNullable<ScratchBlock["schema"]>[string];

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

    // Update context with user email, authHeader, and ensure universe is set
    const enrichedContext: ScratchContext = {
      ...context,
      userEmail,
      universe: universe,
      authHeader: authHeader, // Store authHeader for nested calls
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
          const typedPropSchema = propSchema as SchemaProperty;
          if (
            typedPropSchema.type === "json" &&
            data[key] !== undefined &&
            data[key] !== null &&
            data[key] !== ""
          ) {
            try {
              // If data[key] is already an object, use it directly
              let parsed = data[key];
              if (typeof data[key] === "string") {
                parsed = JSON.parse(data[key]);
              }
              if (typedPropSchema.schema) {
                const wrappedSchema: JsonSchema = {
                  type: "object",
                  properties: { value: typedPropSchema.schema },
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
          const typedPropSchema = propSchema as SchemaProperty;
          if (
            typedPropSchema.type === "json" &&
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
          const typedPropSchema = propSchema as SchemaProperty;
          if (typedPropSchema.type === "json" && data[key] !== undefined)
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
    // Type assertion: schema is defined as Record<string, {...}>, so propSchema is the value type
    const typedPropSchema = propSchema as SchemaProperty;
    if (typedPropSchema.type === "json") {
      if (!typedPropSchema.schema)
        throw new Error(
          `Property ${key} has type "json" but no schema provided`
        );
      properties[key] = {
        type: "string",
        description: typedPropSchema.description,
        _jsonSchema: typedPropSchema.schema,
      };
    } else {
      // Copy schema but exclude non-JSON-Schema fields
      const {
        default: _,
        description: __,
        ...jsonSchemaProps
      } = typedPropSchema;
      properties[key] = jsonSchemaProps;
      // Only add to required if there's no default or default is a placeholder
      if (!typedPropSchema.default || typedPropSchema.default === `[${key}]`) {
        required.push(key);
      }
    }
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
