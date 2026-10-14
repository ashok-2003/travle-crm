// Mutations over HTTP must come from our own web app: browsers send Origin on every cross-site POST, and a form-style
// content type would skip the preflight that otherwise protects JSON calls.
import type { Identity } from "@travel-crm/domain/identity";
import type { MiddlewareHandler } from "hono";

/**
 * Refuses every request but GET and HEAD unless it names a trusted origin (Better Auth's own list: its base URL and the
 * configured trusted origins) and carries JSON. An upload procedure will need its own route with its own checks.
 */
export function requireTrustedJson(identity: Identity): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next();
    const { trustedOrigins } = await identity.auth.$context;
    const origin = c.req.header("origin");
    if (origin === undefined || !trustedOrigins.includes(origin)) {
      return c.json({ code: "FORBIDDEN", message: "Requests must come from the web app" }, 403);
    }
    const contentType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return c.json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Send JSON" }, 415);
    }
    return next();
  };
}
