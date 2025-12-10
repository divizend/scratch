/**
 * NativeHttpServer - Native Node.js HTTP server implementation
 *
 * This implementation uses Node's native http module for full control
 * over routing and dynamic route registration.
 */

import {
  createServer,
  Server,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, isAbsolute, join, basename } from "node:path";
import { readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { HttpServer } from "./HttpServer";
import {
  Universe,
  UniverseModule,
  ScratchBlock,
  ScratchContext,
  ScratchEndpointDefinition,
} from "../core/index";
import { envOrDefault } from "../core/Env";
import {
  createMiddlewareChain,
  wrapHandlerWithAuthAndValidation,
  handleHandlerResult,
  MiddlewareContext,
  Middleware,
} from "./middlewares";

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  context: ScratchContext
) => Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  opcode: string;
}

export class NativeHttpServer implements HttpServer {
  private server: Server | null = null;
  private universe: Universe;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private endpoints: Map<string, ScratchEndpointDefinition> = new Map();
  private handlersObject: Record<
    string,
    (
      context: ScratchContext,
      query?: Record<string, string>,
      requestBody?: any,
      authHeader?: string
    ) => Promise<any>
  > = {};
  private routes: Route[] = [];
  private staticRoot: string | null = null;
  private middlewares: Middleware[] = [];
  private endpointMetadata: Map<
    string,
    { noAuth?: boolean; requiredModules?: UniverseModule[] }
  > = new Map();

  constructor(universe: Universe) {
    this.universe = universe;
    this.setupMiddlewares();
  }

  private setupMiddlewares(): void {
    // Setup middleware chain in order
    this.middlewares = createMiddlewareChain(this.staticRoot);
  }

  private parseQuery(url: string): Record<string, string> {
    try {
      const urlObj = new URL(url, "http://localhost");
      return Object.fromEntries(urlObj.searchParams);
    } catch {
      // Fallback for relative URLs
      const queryIndex = url.indexOf("?");
      if (queryIndex < 0) return {};
      const params = new URLSearchParams(url.substring(queryIndex + 1));
      return Object.fromEntries(params);
    }
  }

  private parsePath(url: string): string {
    try {
      const urlObj = new URL(url, "http://localhost");
      return urlObj.pathname;
    } catch {
      // Fallback for relative URLs
      const queryIndex = url.indexOf("?");
      return queryIndex >= 0 ? url.substring(0, queryIndex) : url;
    }
  }

  private async executeMiddlewareChain(
    ctx: MiddlewareContext,
    index: number = 0
  ): Promise<void> {
    if (index >= this.middlewares.length) {
      // All middlewares executed, now handle routing
      await this.handleRouting(ctx);
      return;
    }

    const middleware = this.middlewares[index];
    let nextCalled = false;

    const next = async () => {
      if (nextCalled) return; // Prevent double-calling
      nextCalled = true;
      await this.executeMiddlewareChain(ctx, index + 1);
    };

    const result = middleware(ctx, next);
    if (result instanceof Promise) {
      await result;
    }

    // If middleware didn't call next(), it handled the request itself
    // Don't continue the chain in that case
    if (!nextCalled) {
      return;
    }
  }

  private async handleRouting(ctx: MiddlewareContext): Promise<void> {
    const { req, res, context } = ctx;
    const method = req.method || "GET";
    const path = context.path || "";

    // Find matching route
    let matchedRoute: Route | null = null;
    for (const route of this.routes) {
      if (route.method.toLowerCase() === method.toLowerCase()) {
        if (route.path === path || (route.path === "/" && path === "")) {
          matchedRoute = route;
          break;
        }
      }
    }

    if (!matchedRoute) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      await matchedRoute.handler(req, res, context);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }

  private async handleRequest(
    req: IncomingMessage | any,
    res: ServerResponse | any
  ): Promise<void> {
    // Wait for initialization
    if (!this.isInitialized && this.initPromise) {
      await this.initPromise;
    }

    const method = req.method || "GET";
    const urlString = req.url || "/";
    const path = this.parsePath(urlString);
    const query = this.parseQuery(urlString);

    // Create middleware context
    const ctx: MiddlewareContext = {
      req,
      res,
      context: {
        universe: this.universe,
        path,
      },
      metadata: {},
    };

    try {
      await this.executeMiddlewareChain(ctx);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    }
  }

  registerStaticFiles(rootPath: string): void {
    this.staticRoot = rootPath;
    // Rebuild middleware chain with new static root
    this.setupMiddlewares();
  }

  async registerEndpoints(
    endpoints: ScratchEndpointDefinition[]
  ): Promise<void> {
    // Add to endpoints map
    for (const endpoint of endpoints) {
      const blockDef = await endpoint.block({});
      if (!blockDef.opcode || blockDef.opcode === "") {
        throw new Error("Endpoint opcode cannot be empty");
      }
      this.endpoints.set(blockDef.opcode, endpoint);
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
    const blockDef = await block({});
    if (!blockDef.opcode || blockDef.opcode === "") {
      throw new Error("Endpoint opcode cannot be empty");
    }
    const storedOpcode = blockDef.opcode;
    const endpoint = `/${storedOpcode}`;
    const method = blockDef.blockType === "reporter" ? "GET" : "POST";

    // Remove existing route with same method and path (overwrite)
    this.routes = this.routes.filter(
      (r) => !(r.method === method && r.path === endpoint)
    );

    // Store metadata for handler wrapping
    this.endpointMetadata.set(storedOpcode, {
      noAuth,
      requiredModules,
    });

    // Create route handler - simplified, auth/validation is in wrapped handler
    const routeHandler: RouteHandler = async (req, res, baseContext) => {
      const query = this.parseQuery(req.url || "");
      const authHeader = req.headers.authorization;
      const requestBody = (req as any).body;

      // Create minimal context (only userEmail, inputs, universe)
      const context: ScratchContext = {
        universe: this.universe,
      };

      try {
        // Get the wrapped handler from handlersObject
        const wrappedHandler = this.handlersObject[storedOpcode];
        if (!wrappedHandler) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Handler not found" }));
          return;
        }

        // Execute the wrapped handler (includes auth and validation)
        // Pass query, requestBody, and authHeader as separate parameters
        const result = await wrappedHandler(
          context,
          query,
          requestBody,
          authHeader
        );

        // Handle the result
        handleHandlerResult(result, res);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const statusCode =
          errorMessage.includes("authentication") ||
          errorMessage.includes("authorization") ||
          errorMessage.includes("token")
            ? 401
            : errorMessage.includes("Validation failed") ||
              errorMessage.includes("Invalid")
            ? 400
            : errorMessage.includes("modules not available")
            ? 503
            : 500;

        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMessage }));
      }
    };

    // Add route
    this.routes.push({
      method,
      path: endpoint,
      handler: routeHandler,
      opcode: storedOpcode,
    });
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        });
      });

      this.server.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getFetchHandler(): (request: Request) => Promise<Response> {
    // Convert Fetch API Request to Node.js-like request/response
    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname;
      const query = Object.fromEntries(url.searchParams);

      // Read body if present
      let body: any = null;
      if (["POST", "PUT", "PATCH"].includes(method)) {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        } else {
          try {
            body = await request.text();
          } catch {
            body = "";
          }
        }
      }

      // Create mock Node.js request/response objects
      const headers: Record<string, string> = {};
      for (const [key, value] of request.headers.entries()) {
        headers[key] = value;
      }
      // Ensure host header is set (extract from URL if not present)
      if (!headers.host && !headers["host"]) {
        headers.host = url.host;
      }

      const nodeReq = {
        method,
        url: path + url.search,
        headers,
        body, // Store body for later use in route handlers
        on: () => {},
      } as any;

      let responseBody: string = "";
      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};

      const nodeRes = {
        writeHead: (status: number, headers?: Record<string, string>) => {
          statusCode = status;
          if (headers) {
            Object.assign(responseHeaders, headers);
          }
        },
        setHeader: (key: string, value: string) => {
          responseHeaders[key] = value;
        },
        end: (data?: string) => {
          if (data) responseBody = data;
        },
        headers: responseHeaders,
      } as any;

      // Handle the request
      await this.handleRequest(nodeReq, nodeRes);

      return new Response(responseBody || "", {
        status: statusCode,
        headers: responseHeaders,
      });
    };
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
    const endpoints = this.getAllEndpoints();
    const endpointInfos = await Promise.all(
      endpoints.map(async (endpoint) => {
        const blockDef = await endpoint.block({});
        if (!blockDef.opcode || blockDef.opcode === "") {
          throw new Error("Endpoint opcode cannot be empty");
        }
        const opcode = blockDef.opcode;
        const endpointPath = `/${opcode}`;
        const method = blockDef.blockType === "reporter" ? "GET" : "POST";
        const auth = endpoint.noAuth ? " (no auth)" : "";
        return {
          method,
          endpoint: endpointPath,
          blockType: blockDef.blockType,
          auth,
          text: blockDef.text,
        };
      })
    );
    endpointInfos.sort((a, b) => a.text.localeCompare(b.text));
    return endpointInfos;
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
          if (!blockDef.opcode || blockDef.opcode === "") {
            throw new Error(`Endpoint from ${filePath} has empty opcode`);
          }
          this.endpoints.set(blockDef.opcode, endpoint);
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
    Record<
      string,
      (
        context: ScratchContext,
        query?: Record<string, string>,
        requestBody?: any,
        authHeader?: string
      ) => Promise<any>
    >
  > {
    if (!Object.keys(this.handlersObject).length) {
      await this.buildHandlersObject();
    }
    return this.handlersObject;
  }

  async getHandler(
    opcode: string
  ): Promise<
    | ((
        context: ScratchContext,
        query?: Record<string, string>,
        requestBody?: any,
        authHeader?: string
      ) => Promise<any>)
    | undefined
  > {
    const handlers = await this.getEndpointHandlers();
    return handlers[opcode];
  }

  private async buildHandlersObject(): Promise<void> {
    this.handlersObject = {};
    const endpoints = this.getAllEndpoints();
    for (const endpoint of endpoints) {
      const blockDef = await endpoint.block({});
      if (!blockDef.opcode || blockDef.opcode === "") {
        throw new Error("Endpoint opcode cannot be empty");
      }
      const opcode = blockDef.opcode;
      const metadata = this.endpointMetadata.get(opcode) || {
        noAuth: endpoint.noAuth,
        requiredModules: endpoint.requiredModules,
      };

      // Wrap handler with auth and validation
      const wrappedHandler = await wrapHandlerWithAuthAndValidation({
        universe: this.universe,
        endpoint,
        noAuth: metadata.noAuth,
        requiredModules: metadata.requiredModules,
      });

      this.handlersObject[opcode] = wrappedHandler;
    }
  }

  private async iterateEndpointFiles(directoryPath: string): Promise<string[]> {
    try {
      const files = await readdir(directoryPath);
      // Include all .ts files - files that don't export endpoints will be filtered out during parsing
      const tsFiles = files.filter((f) => f.endsWith(".ts"));
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
      const absolutePath = resolve(filePath);
      const module = await import(absolutePath);

      // Try to find endpoint by filename first
      const fileName = basename(filePath, ".ts");
      if (module[fileName]) {
        return module[fileName] as ScratchEndpointDefinition;
      }

      // Search all exports for an endpoint definition
      const endpoint = Object.values(module).find(
        (value): value is ScratchEndpointDefinition =>
          value !== null &&
          typeof value === "object" &&
          "block" in value &&
          "handler" in value
      );

      if (endpoint) {
        return endpoint;
      }

      console.warn(`No endpoint definition found in ${filePath}`);
      return null;
    } catch (error) {
      console.error(`Failed to parse endpoint from ${filePath}:`, error);
      return null;
    }
  }

  async registerEndpoint(source: string): Promise<{
    success: boolean;
    opcode?: string;
    message?: string;
    error?: string;
  }> {
    try {
      // Create a temporary file to evaluate the TypeScript code
      const tempFile = `/tmp/endpoint_${Date.now()}_${randomUUID()}.ts`;

      // Write source to temp file
      await Bun.write(tempFile, source);

      try {
        // Import the module
        const module = await import(tempFile);

        // Find the endpoint definition
        const endpoint = Object.values(module).find(
          (value): value is ScratchEndpointDefinition =>
            value !== null &&
            typeof value === "object" &&
            "block" in value &&
            "handler" in value
        );

        if (!endpoint) {
          throw new Error("No endpoint definition found in source code");
        }

        // Get the opcode
        const blockDef = await endpoint.block({});
        if (!blockDef.opcode || blockDef.opcode === "") {
          throw new Error("Endpoint opcode cannot be empty");
        }
        const opcode = blockDef.opcode;

        // Add to endpoints map (overwrites if exists)
        this.endpoints.set(opcode, endpoint);

        // Remove existing routes with same opcode (before registering new ones)
        this.routes = this.routes.filter((r) => r.opcode !== opcode);

        // Register the endpoint (this will add HTTP routes and build handlers)
        await this.registerEndpoints([endpoint]);

        // Ensure handlers are built (registerEndpoints already does this, but be explicit)
        await this.buildHandlersObject();

        // Clean up temp file
        try {
          await Bun.file(tempFile).unlink();
        } catch (e) {
          // Ignore cleanup errors
        }

        return {
          success: true,
          opcode,
          message: `Endpoint "${opcode}" registered successfully`,
        };
      } catch (error: any) {
        // Clean up temp file on error
        try {
          await Bun.file(tempFile).unlink();
        } catch (e) {
          // Ignore cleanup errors
        }
        throw error;
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }
}
