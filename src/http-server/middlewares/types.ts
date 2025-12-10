/**
 * Middleware types for NativeHttpServer
 */

import { IncomingMessage, ServerResponse } from "node:http";
import { ScratchContext } from "../../core/index";

export interface MiddlewareContext {
  req: IncomingMessage | any;
  res: ServerResponse | any;
  context: ScratchContext & { [key: string]: any };
  metadata: {
    requestId?: string;
    startTime?: number;
    [key: string]: any;
  };
}

export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void> | void;

export interface MiddlewareResult {
  handled: boolean;
}

