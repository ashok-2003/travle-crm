// GET /api/live (inbox revamp spec, part 1 item 4): the Inbox's live stream, server-sent events for a signed-in member who
// may read the inbox, read from the session as every request is. Each event is named `inbox` and carries a chat's id and
// what changed in it, only for chats the member may see (live-hub.ts). A comment line every LIVE_HEARTBEAT_MS keeps
// proxies from closing a quiet stream; the member's access is read again every few minutes and the stream ends when it
// no longer holds; past MAX_LIVE_STREAMS_PER_MEMBER the next is refused with 429. Opens and closes are logged as counts and
// codes. `no-transform` keeps a compressing proxy (Next's own included) from holding the events back.
import { TRPCError } from "@trpc/server";
import { ACCESS_CACHE_TTL_MS } from "@travel-crm/api";
import { INBOX_LIVE_EVENT, LIVE_HEARTBEAT_MS } from "@travel-crm/contracts/inbox";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import type { Logger } from "@travel-crm/integrations/logging";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { LiveHub, LiveStream } from "./live-hub.js";
import { requestOf } from "./request-log.js";

export interface LiveRouteOptions {
  hub: LiveHub;
  /** The member the request serves (memberForRoute with inbox:view); refuses as the procedures do. */
  memberOf: (request: Request, responseHeaders: Headers) => Promise<MemberAccess>;
  /** Whether a browser's Origin header names our own web app. */
  trustedOrigin: (origin: string) => Promise<boolean>;
  logger: Logger;
  heartbeatMs?: number;
  /** How often an open stream reads its member's access again. */
  recheckMs?: number;
}

/** A refusal as plain JSON: 401 when nobody is signed in, 403 for a member the inbox is not for. */
function refusalOf(error: unknown): { status: 401 | 403; code: string; reason: string | null } | null {
  if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
    return { status: 401, code: "UNAUTHORIZED", reason: null };
  if (error instanceof DomainError) return { status: 403, code: error.code, reason: error.reason };
  return null;
}

export function liveRoute({
  hub,
  memberOf,
  trustedOrigin,
  logger,
  heartbeatMs = LIVE_HEARTBEAT_MS,
  recheckMs = ACCESS_CACHE_TTL_MS,
}: LiveRouteOptions): Hono {
  const route = new Hono();
  route.get("/", async (c) => {
    // A browser names the origin of a cross-site request (a same-origin GET names none): only our own app may open one.
    const origin = c.req.header("origin");
    if (origin !== undefined && !(await trustedOrigin(origin))) {
      return c.json({ code: "FORBIDDEN", message: "Requests must come from the web app" }, 403);
    }
    const responseHeaders = new Headers();
    let access: MemberAccess;
    try {
      access = await memberOf(c.req.raw, responseHeaders);
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal === null) throw error;
      return c.json({ code: refusal.code, reason: refusal.reason }, refusal.status);
    }
    const request = requestOf(c);
    if (request !== undefined) {
      request.organizationId = access.organizationId;
      request.userId = access.userId;
    }
    let send: (text: string) => void = () => undefined;
    let end: () => void = () => undefined;
    const stream: LiveStream = {
      access,
      send: (event) => {
        send(`event: ${INBOX_LIVE_EVENT}\ndata: ${JSON.stringify(event)}\n\n`);
      },
      close: () => {
        end();
      },
    };
    const leave = hub.join(stream);
    if (leave === null) {
      logger.info({ organizationId: access.organizationId, open: hub.size() }, "live stream refused: too many");
      return c.json({ code: "TOO_MANY_STREAMS", reason: null }, 429);
    }
    for (const cookie of responseHeaders.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    logger.info({ organizationId: access.organizationId, open: hub.size() }, "live stream opened");
    const response = streamSSE(c, async (sse) => {
      let closedBy = "client";
      const ended = new Promise<void>((resolve) => {
        end = () => {
          closedBy = closedBy === "client" ? "server" : closedBy;
          resolve();
        };
        sse.onAbort(() => {
          resolve();
        });
      });
      send = (text) => {
        void sse.write(text);
      };
      // The browser reconnects 3 s after a stream ends (its own default varies).
      send("retry: 3000\n\n");
      const heartbeat = setInterval(() => {
        send(": keep-alive\n\n");
      }, heartbeatMs);
      const recheck = setInterval(() => {
        memberOf(c.req.raw, new Headers()).then(
          (renewed) => {
            stream.access = renewed;
          },
          () => {
            closedBy = "access";
            end();
          },
        );
      }, recheckMs);
      try {
        await ended;
      } finally {
        clearInterval(heartbeat);
        clearInterval(recheck);
        leave();
        logger.info({ organizationId: access.organizationId, open: hub.size(), closedBy }, "live stream closed");
      }
    });
    // After streamSSE, which sets its own Cache-Control.
    response.headers.set("Cache-Control", "no-cache, no-transform");
    response.headers.set("X-Accel-Buffering", "no");
    return response;
  });
  return route;
}
