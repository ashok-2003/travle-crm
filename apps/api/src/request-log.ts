// One `info` line per request (ADR 0032), for the api and the console: a request id, the method, the route pattern (or
// the tRPC procedures), the status, the duration, and the organization and user ids once known. Never the raw path,
// query, headers or body: a path carries ids and tokens, a query carries what someone searched for.
import { AsyncLocalStorage } from "node:async_hooks";
import { DomainError, newUuidV7 } from "@travel-crm/domain/kernel";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import type { Context, MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

/** What the request learns about itself as it runs, for the line written when it ends. */
export interface RequestLog {
  requestId: string;
  /** The process's logger, with the request id on every line. */
  logger: Logger;
  organizationId?: string;
  userId?: string;
  /** A tRPC refusal: its status code and the reason the web app shows a sentence for. */
  refusal?: { code: string; reason: string | null };
  /** The error that made the call fail, for its name and code. */
  error?: unknown;
}

export interface RequestLogEnv {
  Variables: { requestLog: RequestLog };
}

const requests = new AsyncLocalStorage<RequestLog>();

/**
 * A logger for code that has no request in hand (Better Auth's, a pg-boss callback): each line goes through the logger
 * of the request it runs in, so it carries that request's id, and through `fallback` outside any request.
 */
export function loggerOfRequest(fallback: Logger): Logger {
  const current = () => requests.getStore()?.logger ?? fallback;
  return {
    child: (bindings) => current().child(bindings),
    debug: (fields, message) => {
      current().debug(fields, message);
    },
    info: (fields, message) => {
      current().info(fields, message);
    },
    warn: (fields, message) => {
      current().warn(fields, message);
    },
    error: (fields, message) => {
      current().error(fields, message);
    },
  };
}

/** The request a handler runs in, or undefined in an app that doesn't use the middleware (a test's). */
export function requestOf(c: Context): RequestLog | undefined {
  return (c as Context<RequestLogEnv>).get("requestLog");
}

/** A request id someone else sent is kept only when it is a plain token: anything else could be log injection. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
/** A procedure name is code: `leads.list`. */
const PROCEDURE_NAME = /^[A-Za-z][\w.]{0,63}$/;
const MAX_PROCEDURES = 20;
/** A path segment of Better Auth's that names an action (`sign-in`, `change-password`), not a token or an id. */
const AUTH_WORD = /^[a-z][a-z-]{0,31}$/;
const HEALTH_ROUTES = new Set(["/health", "/api/platform/health"]);

export function requestIdFrom(header: string | undefined): string {
  return header !== undefined && SAFE_REQUEST_ID.test(header) ? header : newUuidV7();
}

/** The tRPC procedures a call names: `/api/trpc/leads.list,me.get` is a batch of two. */
export function proceduresOf(path: string, endpoint: string): string[] {
  const names = path.slice(endpoint.length + 1).split(",");
  return names.slice(0, MAX_PROCEDURES).map((name) => (PROCEDURE_NAME.test(name) ? name : "?"));
}

/** `/api/auth/reset-password/<token>` as `/api/auth/reset-password/*`: only the words that name an action stay. */
function authRoute(path: string): string {
  const words = path.split("/").slice(3);
  const kept: string[] = [];
  for (const word of words) {
    if (!AUTH_WORD.test(word) || kept.length === 2) {
      kept.push("*");
      break;
    }
    kept.push(word);
  }
  return ["/api/auth", ...kept].join("/");
}

function routeOf(c: Context): { route: string; procedures?: string[] } {
  const { path } = c.req;
  for (const endpoint of ["/api/trpc", "/api/platform/trpc"]) {
    if (path.startsWith(`${endpoint}/`)) return { route: endpoint, procedures: proceduresOf(path, endpoint) };
  }
  if (path.startsWith("/api/auth/")) return { route: authRoute(path) };
  const matched = routePath(c);
  return { route: matched === "/*" || matched === "*" ? "unmatched" : matched };
}

function levelOf(status: number, route: string): "debug" | "info" | "warn" | "error" {
  if (HEALTH_ROUTES.has(route)) return "debug";
  if (status >= 500) return "error";
  return status >= 400 ? "warn" : "info";
}

/** Writes the request's line when it ends, and echoes the request id on the response. */
export function requestLog(logger: Logger): MiddlewareHandler<RequestLogEnv> {
  return async (c, next) => {
    const requestId = requestIdFrom(c.req.header("x-request-id"));
    const request: RequestLog = { requestId, logger: logger.child({ requestId }) };
    c.set("requestLog", request);
    const started = performance.now();
    await requests.run(request, next);
    // After the handler: a raw Response a handler returns (tRPC's) replaces the headers set before it.
    c.header("x-request-id", requestId);
    const status = c.res.status;
    const { route, procedures } = routeOf(c);
    const failure = request.error ?? c.error;
    request.logger[levelOf(status, route)](
      {
        method: c.req.method,
        route,
        ...(procedures === undefined ? {} : { procedures }),
        status,
        durationMs: Math.round(performance.now() - started),
        ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
        ...(request.userId === undefined ? {} : { userId: request.userId }),
        ...(request.refusal === undefined ? {} : { refusalCode: request.refusal.code, reason: request.refusal.reason }),
        ...(status >= 500 && failure !== undefined ? errorFields(failure) : {}),
      },
      "request",
    );
  };
}

/**
 * What a failed tRPC call tells the log: a fault is written at once, with the error that caused it (tRPC wraps it, and
 * the original has the name, code and frames) and kept for the request line; a refusal is kept for the request line
 * with its status code and the domain reason, if it has one.
 */
export function noteTrpcError(request: RequestLog, error: { code: string; cause?: unknown }, procedure?: string): void {
  if (error.code === "INTERNAL_SERVER_ERROR") {
    const cause = error.cause ?? error;
    request.error ??= cause;
    request.logger.error({ procedure: procedure ?? "?", ...errorFields(cause) }, "tRPC call failed");
  } else {
    request.refusal ??= { code: error.code, reason: error.cause instanceof DomainError ? error.cause.reason : null };
  }
}
