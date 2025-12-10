/**
 * Endpoints - Complete endpoint system (registration, middleware, validation, handlers)
 */

import { Hono } from "hono";
import {
  Universe,
  UniverseModule,
  ScratchBlock,
  ScratchContext,
  ScratchEndpoint,
  ScratchEndpointDefinition,
  JsonSchema,
  JsonSchemaValidator,
  getUniverse,
} from "../core";
import { join, resolve } from "node:path";
import { cwd } from "node:process";

// Registry
export const scratchEndpoints: ScratchEndpoint[] = [];
export const getRegisteredEndpoints = () => [...scratchEndpoints];

// Handler management
let allEndpoints: ScratchEndpointDefinition[] = [];
let handlersObject: Record<string, (context: any) => Promise<any>> = {};

export function getAllEndpointDefinitions(): ScratchEndpointDefinition[] {
  const universe = getUniverse();
  return universe ? universe.endpoints.getAll() : [...allEndpoints];
}

export async function getEndpointHandlers() {
  if (Object.keys(handlersObject).length === 0 && allEndpoints.length > 0) {
    for (const endpoint of allEndpoints) {
      const blockDef = await endpoint.block({});
      handlersObject[blockDef.opcode || ""] = endpoint.handler;
    }
  }
  return handlersObject;
}

export async function getHandler(opcode: string) {
  const handlers = await getEndpointHandlers();
  return handlers[opcode];
}

// Validation helpers
function generateDefaultFromSchema(propSchema: any): any {
  if (propSchema.default !== undefined) return propSchema.default;
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
  return { type: "object", properties, required, additionalProperties: false };
}

function createValidationMiddleware(block: ScratchBlock) {
  return async (c: any, next: any) => {
    try {
      const fullSchema = constructJsonSchema(block.schema);
      const isGet = c.req.method === "GET";
      let data: any = isGet
        ? block.schema
          ? Object.fromEntries(
              Object.keys(block.schema).map((key) => [key, c.req.query()[key]])
            )
          : {}
        : await c.req.json().catch(() => ({}));
      const universe = getUniverse();
      const validator =
        universe?.jsonSchemaValidator || new JsonSchemaValidator();

      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
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
                if (!result.valid)
                  return c.json(
                    {
                      error: `Validation failed for ${key}`,
                      errors: result.errors,
                    },
                    400
                  );
                data[key] = result.data?.value ?? parsed;
              } else {
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

      const dataForValidation: any = { ...data };
      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
          if (
            propSchema.type === "json" &&
            dataForValidation[key] !== undefined
          )
            delete dataForValidation[key];
        }
      }

      const result = validator.validate(fullSchema, dataForValidation);
      if (!result.valid)
        return c.json(
          { error: "Validation failed", errors: result.errors },
          400
        );

      const finalData = { ...result.data };
      if (block.schema) {
        for (const [key, propSchema] of Object.entries(block.schema)) {
          if (propSchema.type === "json" && data[key] !== undefined)
            finalData[key] = data[key];
        }
      }

      c.validatedBody = finalData;
      return next();
    } catch (error) {
      return c.json({ error: "Invalid request" }, 400);
    }
  };
}

// Middleware factories
function createJwtAuthMiddleware(universe: Universe) {
  return async (c: any, next: any) => {
    if (!universe.auth.isConfigured())
      return c.json({ error: "JWT authentication not configured" }, 500);
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    const token = authHeader.substring(7);
    try {
      const payload = await universe.auth.validateJwtToken(token);
      if (!payload) return c.json({ error: "Invalid or expired token" }, 401);
      await next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  };
}

function createContextMiddleware(
  universe: Universe,
  block: (context: ScratchContext) => Promise<ScratchBlock>
) {
  return async (c: any, next: any) => {
    let userEmail: string | undefined;
    try {
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const payload = await universe.auth.validateJwtToken(
          authHeader.substring(7)
        );
        if (payload) userEmail = (payload as any)?.email;
      }
    } catch {}
    const context: ScratchContext & { c?: any; query?: any } = {
      userEmail,
      universe,
      c,
      query: c.req.query(),
    };
    c.scratchContext = context;
    c.scratchBlock = await block(context);
    await next();
  };
}

function createModuleValidationMiddleware(requiredModules: UniverseModule[]) {
  return async (c: any, next: any) => {
    const context = c.scratchContext;
    if (!context.universe)
      return c.json({ error: "Universe not initialized" }, 503);
    if (requiredModules.length > 0) {
      const missingModules = requiredModules.filter(
        (module) => !context.universe!.hasModule(module)
      );
      if (missingModules.length > 0)
        return c.json(
          {
            error: `Required modules not available: ${missingModules.join(
              ", "
            )}`,
            missingModules,
          },
          503
        );
    }
    await next();
  };
}

function createValidationWrapperMiddleware() {
  return async (c: any, next: any) => {
    const result = await createValidationMiddleware(c.scratchBlock)(
      c,
      async () => {
        c.scratchContext.validatedBody = c.validatedBody;
        await next();
      }
    );
    return result;
  };
}

function createErrorHandlingMiddleware(
  handler: (context: ScratchContext) => Promise<any>
) {
  return async (c: any) => {
    try {
      const result = await handler(c.scratchContext);
      if (result instanceof Response) return result;
      if (typeof result === "string") return c.text(result);
      if (result === null || result === undefined)
        return c.json({ success: true });
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  };
}

// Registration functions
async function registerScratchEndpoint(
  app: Hono,
  universe: Universe,
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
  const middlewares: Array<(c: any, next?: any) => Promise<any> | any> = [];
  if (!noAuth) middlewares.push(createJwtAuthMiddleware(universe));
  middlewares.push(createContextMiddleware(universe, block));
  middlewares.push(createModuleValidationMiddleware(requiredModules));
  middlewares.push(createValidationWrapperMiddleware());
  middlewares.push(createErrorHandlingMiddleware(handler));

  const blockDef = await block({});
  // Handle root endpoint: "root" opcode maps to "/" path
  const endpoint =
    blockDef.opcode === "root"
      ? "/"
      : blockDef.opcode === ""
      ? "/"
      : `/${blockDef.opcode}`;
  const method = blockDef.blockType === "reporter" ? "get" : "post";

  // Store opcode: use "root" if empty, otherwise use the opcode
  const storedOpcode = blockDef.opcode === "" ? "root" : blockDef.opcode;
  scratchEndpoints.push({
    opcode: storedOpcode,
    block,
    endpoint,
    noAuth,
  });
  app[method](endpoint, ...middlewares);
}

async function registerScratchEndpoints(
  app: Hono,
  universe: Universe,
  endpoints: ScratchEndpointDefinition[]
) {
  await Promise.all(
    endpoints.map((endpoint) =>
      registerScratchEndpoint(app, universe, {
        block: endpoint.block,
        handler: endpoint.handler,
        noAuth: endpoint.noAuth,
        requiredModules: endpoint.requiredModules,
      })
    )
  );
}

// Re-exports
export { setUniverse, getUniverse } from "../core";

// Main registration
export async function registerEndpoints(app: Hono) {
  const universe = getUniverse();
  if (!universe)
    throw new Error("Universe not initialized. Cannot register endpoints.");

  const endpointsDir = resolve(join(cwd(), "src", "server", "endpoints"));
  await universe.endpoints.loadFromDirectory(endpointsDir);
  allEndpoints = universe.endpoints.getAll();

  handlersObject = {};
  for (const endpoint of allEndpoints) {
    const blockDef = await endpoint.block({});
    handlersObject[blockDef.opcode || ""] = endpoint.handler;
  }

  await registerScratchEndpoints(app, universe, allEndpoints);

  // Stream viewer catch-all
  let streamViewer: ScratchEndpointDefinition | undefined;
  for (const ep of allEndpoints) {
    const blockDef = await ep.block({});
    if (blockDef.opcode === "streamViewer") {
      streamViewer = ep;
      break;
    }
  }
  if (streamViewer) {
    const registeredPaths = new Set<string>();
    for (const ep of allEndpoints) {
      const blockDef = await ep.block({});
      const path =
        blockDef.opcode === "root"
          ? "/"
          : blockDef.opcode === ""
          ? "/"
          : `/${blockDef.opcode}`;
      registeredPaths.add(path);
    }

    app.get("*", async (c, next) => {
      if (registeredPaths.has(c.req.path)) return next();
      const result = await streamViewer.handler({
        c,
        query: c.req.query(),
        userEmail: undefined,
        universe: undefined,
      } as any);
      if (result instanceof Response) return result;
      return typeof result === "string" ? c.html(result) : c.json(result);
    });
  }
}
