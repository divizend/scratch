/**
 * HonoHttpServer - Hono implementation of HttpServer
 *
 * This is the default HTTP server implementation using Hono.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join, resolve, isAbsolute } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { HttpServer } from "./HttpServer";
import {
  Universe,
  UniverseModule,
  ScratchBlock,
  ScratchContext,
  ScratchEndpoint,
  ScratchEndpointDefinition,
  JsonSchema,
  JsonSchemaValidator,
} from "../index";
import { env, envOrDefault } from "../Env";
import { S2 } from "../../s2";

export class HonoHttpServer implements HttpServer {
  private app: Hono;
  private universe: Universe;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private scratchEndpoints: ScratchEndpoint[] = [];
  private endpoints: Map<string, ScratchEndpointDefinition> = new Map();
  private handlersObject: Record<
    string,
    (context: ScratchContext) => Promise<any>
  > = {};

  constructor(universe: Universe) {
    this.universe = universe;
    this.app = new Hono();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    // CORS middleware
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["*"],
        exposeHeaders: ["*"],
      })
    );

    // Middleware to ensure initialization is complete
    this.app.use("*", async (c, next) => {
      if (!this.isInitialized && this.initPromise) {
        await this.initPromise;
      }
      await next();
    });

    // Middleware to log all HTTP requests to S2 stream
    this.app.use("*", async (c, next) => {
      const startTime = Date.now();
      const method = c.req.method;
      const path = c.req.path;
      const query = c.req.query();
      const headers: Record<string, string> = {};

      const headerObj = c.req.header();
      if (headerObj) {
        for (const [key, value] of Object.entries(headerObj)) {
          headers[key] = String(value);
        }
      }

      let body: any = null;
      try {
        if (["POST", "PUT", "PATCH"].includes(method)) {
          const contentType = c.req.header("content-type") || "";
          if (contentType.includes("application/json")) {
            body = await c.req.json().catch(() => null);
          } else if (
            contentType.includes("text/") ||
            contentType.includes("application/")
          ) {
            body = await c.req.text().catch(() => null);
          }
        }
      } catch (error) {
        // Ignore body reading errors
      }

      await next();

      const duration = Date.now() - startTime;
      const status = c.res.status;

      // Log to S2 stream asynchronously
      (async () => {
        try {
          if (!this.universe?.s2) return;

          const hostedAt = env("HOSTED_AT", { required: false });
          if (!hostedAt) return;

          const streamName = `${hostedAt}/http/incoming`;
          const basinName = S2.getBasin();

          await this.universe.s2.appendToStream(basinName, streamName, {
            method,
            path,
            query: Object.keys(query).length > 0 ? query : undefined,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            body: body !== null ? body : undefined,
            status,
            duration,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Failed to log request to S2 stream:", error);
        }
      })();
    });

    // Middleware to set no-cache headers
    this.app.use("*", async (c, next) => {
      await next();
      c.header(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, max-age=0"
      );
      c.header("Pragma", "no-cache");
      c.header("Expires", "0");
    });
  }

  registerStaticFiles(rootPath: string): void {
    // Register static routes under /public/ path
    // This must be registered FIRST (before any middleware that might trigger router building)
    // Map /public/* to the public/ directory in the file system
    this.app.use("/public/*", serveStatic({ root: join(rootPath, "public") }));
  }

  async registerEndpoints(
    endpoints: ScratchEndpointDefinition[]
  ): Promise<void> {
    // Add to endpoints map
    for (const endpoint of endpoints) {
      const blockDef = await endpoint.block({});
      const opcode = blockDef.opcode || "";
      this.endpoints.set(opcode, endpoint);
    }
    // Register as HTTP routes
    await this.registerScratchEndpoints(endpoints);
    // Build handlers
    await this.buildHandlersObject();
  }

  private async registerScratchEndpoints(
    endpoints: ScratchEndpointDefinition[]
  ): Promise<void> {
    await Promise.all(
      endpoints.map((endpoint) =>
        this.registerScratchEndpoint({
          block: endpoint.block,
          handler: endpoint.handler,
          noAuth: endpoint.noAuth,
          requiredModules: endpoint.requiredModules,
        })
      )
    );
  }

  private async registerScratchEndpoint({
    block,
    handler,
    noAuth = false,
    requiredModules = [],
  }: {
    block: (context: ScratchContext) => Promise<ScratchBlock>;
    handler: (context: ScratchContext) => Promise<any>;
    noAuth?: boolean;
    requiredModules?: UniverseModule[];
  }) {
    const middlewares: Array<(c: any, next?: any) => Promise<any> | any> = [];
    if (!noAuth) middlewares.push(this.createJwtAuthMiddleware());
    middlewares.push(this.createContextMiddleware(block));
    middlewares.push(this.createModuleValidationMiddleware(requiredModules));
    middlewares.push(this.createValidationWrapperMiddleware());
    middlewares.push(this.createErrorHandlingMiddleware(handler));

    const blockDef = await block({});
    const endpoint =
      blockDef.opcode === "root"
        ? "/"
        : blockDef.opcode === ""
        ? "/"
        : `/${blockDef.opcode}`;
    const method = blockDef.blockType === "reporter" ? "get" : "post";

    const storedOpcode = blockDef.opcode === "" ? "root" : blockDef.opcode;
    this.scratchEndpoints.push({
      opcode: storedOpcode,
      block,
      endpoint,
      noAuth,
    });

    // Endpoint is already registered in this.endpoints during loadEndpointsFromDirectory

    this.app[method](endpoint, ...middlewares);
  }

  // Validation helpers
  private generateDefaultFromSchema(propSchema: any): any {
    if (propSchema.default !== undefined) return propSchema.default;
    switch (propSchema.type) {
      case "object":
        const obj: any = {};
        if (propSchema.properties) {
          for (const [key, nestedSchema] of Object.entries(
            propSchema.properties
          )) {
            obj[key] = this.generateDefaultFromSchema(nestedSchema);
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

  private constructJsonSchema(schema?: ScratchBlock["schema"]): JsonSchema {
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

  private createValidationMiddleware(block: ScratchBlock) {
    return async (c: any, next: any) => {
      try {
        const fullSchema = this.constructJsonSchema(block.schema);
        const isGet = c.req.method === "GET";
        let data: any = isGet
          ? block.schema
            ? Object.fromEntries(
                Object.keys(block.schema).map((key) => [
                  key,
                  c.req.query()[key],
                ])
              )
            : {}
          : await c.req.json().catch(() => ({}));
        const validator =
          this.universe?.jsonSchemaValidator || new JsonSchemaValidator();

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
  private createJwtAuthMiddleware() {
    return async (c: any, next: any) => {
      if (!this.universe.auth.isConfigured())
        return c.json({ error: "JWT authentication not configured" }, 500);
      const authHeader = c.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer "))
        return c.json(
          { error: "Missing or invalid authorization header" },
          401
        );
      const token = authHeader.substring(7);
      try {
        const payload = await this.universe.auth.validateJwtToken(token);
        if (!payload) return c.json({ error: "Invalid or expired token" }, 401);
        await next();
      } catch {
        return c.json({ error: "Invalid or expired token" }, 401);
      }
    };
  }

  private createContextMiddleware(
    block: (context: ScratchContext) => Promise<ScratchBlock>
  ) {
    return async (c: any, next: any) => {
      let userEmail: string | undefined;
      try {
        const authHeader = c.req.header("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const payload = await this.universe.auth.validateJwtToken(
            authHeader.substring(7)
          );
          if (payload) userEmail = (payload as any)?.email;
        }
      } catch {}
      const context: ScratchContext & { c?: any; query?: any } = {
        userEmail,
        universe: this.universe,
        c,
        query: c.req.query(),
      };
      c.scratchContext = context;
      c.scratchBlock = await block(context);
      await next();
    };
  }

  private createModuleValidationMiddleware(requiredModules: UniverseModule[]) {
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

  private createValidationWrapperMiddleware() {
    return async (c: any, next: any) => {
      const result = await this.createValidationMiddleware(c.scratchBlock)(
        c,
        async () => {
          c.scratchContext.validatedBody = c.validatedBody;
          await next();
        }
      );
      return result;
    };
  }

  private createErrorHandlingMiddleware(
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

  async start(port: number): Promise<void> {
    // Server is started by Bun via the fetch handler
    console.log(`🚀 Server running on http://localhost:${port}`);
  }

  async stop(): Promise<void> {
    // Bun handles server lifecycle
  }

  getFetchHandler(): (request: Request) => Promise<Response> {
    return this.app.fetch.bind(this.app);
  }

  async getRegisteredEndpoints(): Promise<
    Array<{
      method: string;
      endpoint: string;
      blockType: string;
      auth: string;
      text: string;
    }>
  > {
    const endpointInfos = await Promise.all(
      this.scratchEndpoints.map(async (ep) => {
        const blockDef = await ep.block({});
        const method = blockDef.blockType === "reporter" ? "GET" : "POST";
        const auth = ep.noAuth ? " (no auth)" : "";
        return {
          method,
          endpoint: ep.endpoint,
          blockType: blockDef.blockType,
          auth,
          text: blockDef.text,
        };
      })
    );
    endpointInfos.sort((a, b) => a.text.localeCompare(b.text));
    return endpointInfos;
  }

  getRegisteredScratchEndpoints(): ScratchEndpoint[] {
    return [...this.scratchEndpoints];
  }

  // Endpoint management methods
  async loadEndpointsFromDirectory(directoryPath: string): Promise<void> {
    if (!isAbsolute(directoryPath)) {
      throw new Error(`Expected absolute path, got: ${directoryPath}`);
    }

    const filePaths = await this.iterateEndpointFiles(directoryPath);
    const loadedEndpoints: ScratchEndpointDefinition[] = [];

    for (const filePath of filePaths) {
      try {
        const source = await readFile(filePath, "utf-8");
        const endpoint = await this.parseEndpointFromSource(source, filePath);
        if (endpoint) {
          const blockDef = await endpoint.block({});
          const opcode = blockDef.opcode || "";
          this.endpoints.set(opcode, endpoint);
          loadedEndpoints.push(endpoint);
        }
      } catch (error) {
        console.error(`Failed to load endpoint from ${filePath}:`, error);
      }
    }

    // Register endpoints as HTTP routes
    await this.registerScratchEndpoints(loadedEndpoints);

    // Build handlers after loading
    await this.buildHandlersObject();

    // Mark as initialized
    this.isInitialized = true;
  }

  getAllEndpoints(): ScratchEndpointDefinition[] {
    return Array.from(this.endpoints.values());
  }

  async getEndpointHandlers(): Promise<
    Record<string, (context: ScratchContext) => Promise<any>>
  > {
    if (Object.keys(this.handlersObject).length === 0) {
      await this.buildHandlersObject();
    }
    return this.handlersObject;
  }

  async getHandler(
    opcode: string
  ): Promise<((context: ScratchContext) => Promise<any>) | undefined> {
    const handlers = await this.getEndpointHandlers();
    return handlers[opcode];
  }

  private async buildHandlersObject(): Promise<void> {
    this.handlersObject = {};
    const endpoints = this.getAllEndpoints();
    for (const endpoint of endpoints) {
      const blockDef = await endpoint.block({});
      const opcode = blockDef.opcode || "";
      this.handlersObject[opcode] = endpoint.handler;
    }
  }

  private async iterateEndpointFiles(directoryPath: string): Promise<string[]> {
    try {
      const files = await readdir(directoryPath);
      const tsFiles = files.filter(
        (f) =>
          f.endsWith(".ts") &&
          f !== "core.ts" &&
          f !== "emailQueue.ts" &&
          f !== "gsuite.ts" &&
          f !== "streamstore.ts" &&
          f !== "system.ts"
      );
      return tsFiles.map((f) => join(directoryPath, f));
    } catch (error) {
      console.error(`Failed to read directory ${directoryPath}:`, error);
      return [];
    }
  }

  private async parseEndpointFromSource(
    source: string,
    filePath: string
  ): Promise<ScratchEndpointDefinition | null> {
    try {
      const fileName = filePath.split("/").pop()?.replace(".ts", "") || "";
      const exportName = fileName;
      const absolutePath = resolve(filePath);
      const module = await import(absolutePath);

      if (module[exportName]) {
        return module[exportName] as ScratchEndpointDefinition;
      }

      for (const key in module) {
        const value = module[key];
        if (
          value &&
          typeof value === "object" &&
          "block" in value &&
          "handler" in value
        ) {
          return value as ScratchEndpointDefinition;
        }
      }

      console.warn(`No endpoint definition found in ${filePath}`);
      return null;
    } catch (error) {
      console.error(`Failed to parse endpoint from ${filePath}:`, error);
      return null;
    }
  }
}
