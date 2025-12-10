/**
 * HttpServer - Abstract HTTP server interface
 *
 * This interface defines the contract for HTTP server implementations.
 * Currently, only NativeHttpServer is implemented using Node's native http module.
 */

import { ScratchEndpointDefinition, ScratchContext } from "../core/Scratch";

export interface HttpServer {
  /**
   * Start the HTTP server
   * @param port - Port to listen on
   * @returns Promise that resolves when server is ready
   */
  start(port: number): Promise<void>;

  /**
   * Stop the HTTP server
   * @returns Promise that resolves when server is stopped
   */
  stop(): Promise<void>;

  /**
   * Get the fetch handler for the server (for Bun/Cloudflare Workers)
   * @returns Fetch handler function
   */
  getFetchHandler(): (request: Request) => Promise<Response>;

  /**
   * Register static file serving
   * @param rootPath - Root path for static files
   */
  registerStaticFiles(rootPath: string): void;

  /**
   * Load endpoints from a directory
   * @param directoryPath - Absolute path to directory containing endpoint files
   */
  loadEndpointsFromDirectory(directoryPath: string): Promise<void>;

  /**
   * Get all endpoint definitions
   */
  getAllEndpoints(): ScratchEndpointDefinition[];

  /**
   * Register all Scratch endpoints
   * @param endpoints - Array of endpoint definitions
   */
  registerEndpoints(endpoints: ScratchEndpointDefinition[]): Promise<void>;

  /**
   * Get all registered endpoints (for logging/debugging)
   */
  getRegisteredEndpoints(): Promise<
    Array<{
      method: string;
      endpoint: string;
      blockType: string;
      auth: string;
      text: string;
    }>
  >;

  /**
   * Get endpoint handlers as an object keyed by opcode
   */
  getEndpointHandlers(): Promise<
    Record<string, (context: any) => Promise<any>>
  >;

  /**
   * Get handler by opcode
   */
  getHandler(
    opcode: string
  ): Promise<
    | ((
        context: ScratchContext,
        query?: Record<string, string>,
        requestBody?: any,
        authHeader?: string
      ) => Promise<any>)
    | undefined
  >;

  /**
   * Register an endpoint from TypeScript source code (PUT operation - always overwrites)
   * @param source - TypeScript source code for the endpoint
   * @returns Promise that resolves with registration result
   */
  registerEndpoint(source: string): Promise<{
    success: boolean;
    opcode?: string;
    message?: string;
    error?: string;
  }>;

  /**
   * Remove an endpoint by opcode (DELETE operation)
   * @param opcode - The opcode of the endpoint to remove
   * @returns Promise that resolves with removal result
   */
  removeEndpoint(opcode: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
}
