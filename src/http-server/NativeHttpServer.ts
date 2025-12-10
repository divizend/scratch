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

export class NativeHttpServer implements HttpServer {
  private server: Server | null = null;
  private universe: Universe;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  // Single source of truth: endpoints KV store
  private endpoints: Map<string, ScratchEndpointDefinition> = new Map();
  private staticRoot: string | null = null;
  private middlewares: Middleware[] = [];

  constructor(universe: Universe) {
    this.universe = universe;
    this.setupMiddlewares();
  }

  private setupMiddlewares(): void {
    // Setup middleware chain in order
    this.middlewares = createMiddlewareChain(this.staticRoot);
  }

  private filterVercelParams(params: URLSearchParams): Record<string, string> {
    const query: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!key.startsWith("...")) {
        query[key] = value;
      }
    });
    return query;
  }

  private parseQuery(url: string): Record<string, string> {
    try {
      const urlObj = new URL(url, "http://localhost");
      return this.filterVercelParams(urlObj.searchParams);
    } catch {
      // Fallback for relative URLs
      const queryIndex = url.indexOf("?");
      if (queryIndex < 0) return {};
      const params = new URLSearchParams(url.substring(queryIndex + 1));
      return this.filterVercelParams(params);
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

    // Extract opcode from path (remove leading slash, handle empty path)
    // Map root path "/" to "root" endpoint
    let opcode =
      path === "/" ? "" : path.startsWith("/") ? path.substring(1) : path;

    // If opcode is empty (root path), use "root" endpoint
    if (opcode === "") {
      opcode = "root";
    }

    // Look up endpoint directly from KV store (current state, no cache)
    const endpoint = this.endpoints.get(opcode);

    if (!endpoint) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Get endpoint metadata directly from endpoint definition
    const blockDef = await endpoint.block({});
    if (!blockDef.opcode || blockDef.opcode === "") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint opcode cannot be empty" }));
      return;
    }

    const expectedMethod = blockDef.blockType === "reporter" ? "GET" : "POST";
    if (method.toUpperCase() !== expectedMethod) {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Method not allowed. Expected ${expectedMethod}`,
        })
      );
      return;
    }

    try {
      // Build handler on-demand from current endpoint (always fresh)
      const wrappedHandler = await wrapHandlerWithAuthAndValidation({
        universe: this.universe,
        endpoint,
        noAuth: endpoint.noAuth || false,
        requiredModules: endpoint.requiredModules || [],
      });

      const query = this.parseQuery(req.url || "");
      const authHeader = req.headers.authorization || "";
      const requestBody = (req as any).body;

      // Extract request host for extension generation
      const requestHost = req.headers.host || req.headers["host"] || "";

      const scratchContext: ScratchContext = {
        universe: this.universe,
        authHeader: authHeader,
        requestHost: requestHost,
      };

      // Execute handler with current endpoint
      const result = await wrappedHandler(
        scratchContext,
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

  /**
   * PUT operation: Add/overwrite endpoints in KV store
   */
  async registerEndpoints(
    endpoints: ScratchEndpointDefinition[]
  ): Promise<void> {
    // PUT: Always overwrite in endpoints KV store
    for (const endpoint of endpoints) {
      const blockDef = await endpoint.block({});
      if (!blockDef.opcode || blockDef.opcode === "") {
        throw new Error("Endpoint opcode cannot be empty");
      }
      this.endpoints.set(blockDef.opcode, endpoint);
      console.log(`[KV Store] PUT endpoint: ${blockDef.opcode}`);
    }
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
    // Helper to get header value from either Headers object or plain object
    const getHeader = (headers: any, name: string): string | null => {
      if (headers && typeof headers.get === "function") {
        return headers.get(name) || headers.get(name.toLowerCase());
      }
      if (headers && typeof headers === "object") {
        return headers[name] || headers[name.toLowerCase()] || null;
      }
      return null;
    };

    // Convert Fetch API Request to Node.js-like request/response
    return async (request: Request): Promise<Response> => {
      // Handle relative URLs (Vercel may pass relative URLs)
      let requestUrl = request.url;
      if (
        !requestUrl.startsWith("http://") &&
        !requestUrl.startsWith("https://")
      ) {
        // Construct absolute URL from request headers
        const host =
          getHeader(request.headers, "host") ||
          getHeader(request.headers, "Host") ||
          "localhost";
        const protocol =
          getHeader(request.headers, "x-forwarded-proto") ||
          (host.includes("localhost") ? "http" : "https");
        requestUrl = `${protocol}://${host}${
          requestUrl.startsWith("/") ? requestUrl : "/" + requestUrl
        }`;
      }
      const url = new URL(requestUrl);
      const method = request.method;
      const path = url.pathname;
      // Use parseQuery to get filtered query params (removes Vercel's ...path parameter)
      const query = this.parseQuery(url.pathname + url.search);

      // Read body if present
      let body: any = null;
      if (["POST", "PUT", "PATCH"].includes(method)) {
        const contentType = getHeader(request.headers, "content-type") || "";
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
      // Handle both Headers object and plain object
      if (request.headers && typeof request.headers.entries === "function") {
        for (const [key, value] of request.headers.entries()) {
          headers[key] = value;
        }
      } else if (request.headers && typeof request.headers === "object") {
        for (const [key, value] of Object.entries(request.headers)) {
          headers[key] = String(value);
        }
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

    // PUT: Add all loaded endpoints to KV store
    await this.registerEndpoints(loadedEndpoints);

    // Mark as initialized
    this.isInitialized = true;
  }

  getAllEndpoints(): ScratchEndpointDefinition[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Get handlers computed from current endpoints KV store (always fresh)
   */
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
    const handlers: Record<string, any> = {};
    // Always compute from current endpoints KV store
    for (const [opcode, endpoint] of this.endpoints.entries()) {
      const wrappedHandler = await wrapHandlerWithAuthAndValidation({
        universe: this.universe,
        endpoint,
        noAuth: endpoint.noAuth || false,
        requiredModules: endpoint.requiredModules || [],
      });
      handlers[opcode] = wrappedHandler;
    }
    return handlers;
  }

  /**
   * Get handler for specific opcode from current endpoints KV store (always fresh)
   */
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
    // Always look up from current endpoints KV store
    const endpoint = this.endpoints.get(opcode);
    if (!endpoint) {
      return undefined;
    }
    // Build handler on-demand from current endpoint
    return await wrapHandlerWithAuthAndValidation({
      universe: this.universe,
      endpoint,
      noAuth: endpoint.noAuth || false,
      requiredModules: endpoint.requiredModules || [],
    });
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

  /**
   * PUT operation: Register/overwrite an endpoint from TypeScript source code
   * Simple KV store operation - just evaluate and store
   */
  async registerEndpoint(source: string): Promise<{
    success: boolean;
    opcode?: string;
    message?: string;
    error?: string;
  }> {
    try {
      // Create temp file, evaluate, and store - that's it
      const tempFile = `/tmp/endpoint_${Date.now()}_${randomUUID()}.ts`;
      await Bun.write(tempFile, source);

      try {
        const module = await import(tempFile);
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

        const blockDef = await endpoint.block({});
        if (!blockDef.opcode || blockDef.opcode === "") {
          throw new Error("Endpoint opcode cannot be empty");
        }

        // PUT: Store in KV store (that's all!)
        this.endpoints.set(blockDef.opcode, endpoint);

        return {
          success: true,
          opcode: blockDef.opcode,
          message: `Endpoint "${blockDef.opcode}" registered successfully`,
        };
      } finally {
        // Always clean up temp file
        try {
          await Bun.file(tempFile).unlink();
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * DELETE operation: Remove an endpoint by opcode (KV store behavior)
   */
  async removeEndpoint(opcode: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      if (!opcode || opcode === "") {
        throw new Error("Opcode cannot be empty");
      }

      // DELETE: Remove from endpoints KV store
      const existed = this.endpoints.has(opcode);
      this.endpoints.delete(opcode);

      if (existed) {
        return {
          success: true,
          message: `Endpoint "${opcode}" removed successfully`,
        };
      } else {
        return {
          success: true,
          message: `Endpoint "${opcode}" was not registered`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }
}
