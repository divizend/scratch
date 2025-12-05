import { Hono } from "hono";
import { jwtAuth } from "./auth";

export interface ScratchBlock {
  opcode: string;
  blockType: "command" | "reporter" | "boolean" | "hat";
  text: string;
  arguments: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      defaultValue?: string | number | boolean;
    };
  };
}

export interface ScratchContext {
  userEmail?: string;
}

export interface ScratchEndpoint {
  opcode: string;
  block: (context: ScratchContext) => ScratchBlock;
  endpoint: string;
  noAuth?: boolean;
}

// Registry of Scratch endpoints
export const scratchEndpoints: ScratchEndpoint[] = [];

// Get all registered endpoints
export function getRegisteredEndpoints(): ScratchEndpoint[] {
  return [...scratchEndpoints];
}

// Validation middleware that checks request body against block arguments
function validateArguments(block: ScratchBlock) {
  return async (c: any, next: any) => {
    try {
      // For GET requests (reporter blocks), get params from query string
      // For POST requests (command blocks), get from body
      const isGet = c.req.method === "GET";
      let data: any = {};

      if (isGet) {
        // For GET, get all query params
        const query = c.req.query();
        data = Object.fromEntries(
          Object.keys(block.arguments || {}).map((key) => [
            key,
            query[key] !== undefined ? query[key] : undefined,
          ])
        );
      } else {
        try {
          data = await c.req.json();
        } catch {
          data = {};
        }
      }

      const errors: string[] = [];
      const validatedBody: any = { ...data };

      // Check all arguments defined in the block
      if (block.arguments) {
        for (const [key, arg] of Object.entries(block.arguments)) {
          // If argument is missing
          if (!(key in validatedBody) || validatedBody[key] === undefined) {
            // If it has a default value, apply it
            if (arg.defaultValue !== undefined) {
              validatedBody[key] = arg.defaultValue;
            } else {
              // Otherwise, it's required and missing
              errors.push(`Missing required parameter: ${key}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        return c.json(
          {
            error: "Validation failed",
            errors,
          },
          400
        );
      }

      // Attach validated body (with defaults applied) to context for use in handler
      c.validatedBody = validatedBody;
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
export function registerScratchEndpoint(
  app: Hono,
  {
    block,
    handler,
    noAuth = false,
  }: {
    block: (context: ScratchContext) => ScratchBlock;
    handler: (c: any) => Promise<any> | any;
    noAuth?: boolean;
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

    // Create context
    const context: ScratchContext = { userEmail };
    c.scratchContext = context;

    // Get block definition from function
    const blockDef = block(context);
    c.scratchBlock = blockDef;

    await next();
  };

  if (!noAuth) {
    middlewares.push(jwtAuth);
  }
  middlewares.push(contextMiddleware);

  // Create validation middleware that uses the block from context
  const validationMiddleware = async (c: any, next: any) => {
    const blockDef = c.scratchBlock;
    await validateArguments(blockDef)(c, next);
  };
  middlewares.push(validationMiddleware);

  // Wrap handler with automatic error handling and JSON response
  const wrappedHandler = async (c: any) => {
    try {
      const result = await handler(c);
      // If handler returns a Response, use it directly
      if (result instanceof Response) {
        return result;
      }
      // Otherwise, wrap in JSON response
      return c.json(result || { success: true });
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
  // Use a default context to get the opcode
  const defaultContext: ScratchContext = {};
  const blockDef = block(defaultContext);
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
