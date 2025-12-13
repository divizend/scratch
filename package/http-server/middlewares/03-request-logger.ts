/**
 * Request Logger Middleware
 * Logs incoming requests and responses with structured logging
 */

import { randomUUID } from "node:crypto";
import { Middleware, MiddlewareContext } from "./types";

// Keep per-request metadata without leaking memory
const meta = new WeakMap<any, { id: string; start: number }>();

// Minimal structured logger - automatically adds timestamp unless explicitly provided
const log = (record: Record<string, unknown>) => {
  if (!record.ts) {
    record.ts = new Date().toISOString();
  }
  console.log(JSON.stringify(record));
};

// Best-effort client IP from common proxy/CDN headers
const getClientIP = (req: any): string | undefined => {
  const headers = req.headers || {};
  const getHeader = (name: string) => {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const xForwardedFor = getHeader("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim();
  }

  return (
    getHeader("x-real-ip") ||
    getHeader("x-client-ip") ||
    getHeader("cf-connecting-ip") ||
    getHeader("fastly-client-ip") ||
    getHeader("x-cluster-client-ip") ||
    getHeader("x-forwarded") ||
    getHeader("forwarded-for") ||
    getHeader("forwarded") ||
    getHeader("appengine-user-ip") ||
    getHeader("true-client-ip") ||
    getHeader("cf-pseudo-ipv4") ||
    undefined
  );
};

export const requestLoggerMiddleware: Middleware = async (ctx, next) => {
  const { req, res, context, metadata } = ctx;

  // Accept incoming request ID or generate one
  const reqId =
    req.headers?.["x-request-id"] ||
    req.headers?.["X-Request-Id"] ||
    "" ||
    randomUUID();

  // Set response header
  res.setHeader("x-request-id", reqId);

  // Stash timing data for this request
  const start = performance.now();
  metadata.requestId = reqId;
  metadata.startTime = start;
  meta.set(req, { id: reqId, start });

  // Parse URL for logging - use query from context if available (already filtered)
  const url = req.url || "/";
  const urlObj = new URL(url, `http://${req.headers?.host || "localhost"}`);
  const query: Record<string, string> =
    context.query || Object.fromEntries(urlObj.searchParams);

  // Base request log
  log({
    level: "info",
    event: "request",
    req_id: reqId,
    method: req.method || "GET",
    path: urlObj.pathname,
    query: Object.keys(query).length > 0 ? query : undefined,
    ip: getClientIP(req),
    ua: req.headers?.["user-agent"] || undefined,
    referer: req.headers?.referer || req.headers?.referrer || undefined,
    req_len: Number(req.headers?.["content-length"] || "") || undefined,
    content_type: req.headers?.["content-type"] || undefined,
  });

  log({
    level: "info",
    event: "after_request_log",
    req_id: reqId,
    path: urlObj.pathname,
    query_keys: Object.keys(query),
  });

  // Track response status and length
  let statusCode = 200;
  let responseLength: number | undefined = undefined;

  // Intercept writeHead to capture status
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (status: number, headers?: any) {
    statusCode = status;
    if (headers && headers["content-length"]) {
      responseLength = Number(headers["content-length"]) || undefined;
    }
    return originalWriteHead(status, headers);
  };

  // Intercept setHeader to capture content-length
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: string | number) {
    if (name.toLowerCase() === "content-length") {
      responseLength = Number(value) || undefined;
    }
    return originalSetHeader(name, value);
  };

  try {
    await next();

    // Log response after next() completes
    const m = meta.get(req);
    const duration = m ? Math.round(performance.now() - m.start) : undefined;

    log({
      level: "info",
      event: "response",
      req_id: reqId,
      status: statusCode,
      duration_ms: duration,
      res_len: responseLength,
    });

    meta.delete(req);
  } catch (error) {
    // Log error
    const m = meta.get(req);
    const reqIdForError = m?.id || reqId;
    const urlObjForError = new URL(
      req.url || "/",
      `http://${req.headers?.host || "localhost"}`
    );

    log({
      level: "error",
      event: "error",
      req_id: reqIdForError,
      method: req.method || "GET",
      path: urlObjForError.pathname,
      status: statusCode,
      message: error instanceof Error ? error.message : String(error),
    });

    meta.delete(req);
    throw error;
  }
};
