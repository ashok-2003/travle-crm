// The request line (ADR 0032): one per request, with a request id, the route pattern or the tRPC procedures, the
// status and the duration, and never the raw path, the query or the body.
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { proceduresOf, requestIdFrom, requestLog, type RequestLogEnv } from "../src/request-log.js";

const email = "jane.doe@example.com";

/** An app with the middleware and a few routes, over a memory logger. */
function appWithLog() {
  const logger = createMemoryLogger();
  const app = new Hono<RequestLogEnv>();
  app.use("*", requestLog(logger));
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/p/:token", (c) => c.text("page"));
  app.get("/refused", (c) => c.json({}, 403));
  app.get("/api/auth/reset-password/:token", (c) => c.text("ok"));
  app.get("/boom", () => {
    throw Object.assign(new Error(`no mailbox for ${email}`), { code: "ECONNREFUSED" });
  });
  app.onError((error, c) => {
    c.var.requestLog.error = error;
    return c.json({ code: "INTERNAL_SERVER_ERROR" }, 500);
  });
  return { app, entries: logger.entries };
}

describe("the request line", () => {
  it("has the method, the route pattern, the status and the duration, with the request id on the response", async () => {
    const { app, entries } = appWithLog();
    const response = await app.request(`/p/secret-token-123?phone=9876543210&q=${email}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "info", msg: "request", method: "GET", route: "/p/:token", status: 200 });
    expect(typeof entries[0]?.durationMs).toBe("number");
    expect(response.headers.get("x-request-id")).toBe(entries[0]?.requestId);
    expect(JSON.stringify(entries)).not.toMatch(/secret-token|9876543210|jane/);
  });

  it("keeps a request id that is a plain token and makes a new UUID v7 for anything else", async () => {
    const { app, entries } = appWithLog();
    const kept = await app.request("/p/x", { headers: { "x-request-id": "render-abc_123.4" } });
    expect(kept.headers.get("x-request-id")).toBe("render-abc_123.4");
    const replaced = await app.request("/p/x", { headers: { "x-request-id": `${email} injected "}` } });
    expect(replaced.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(entries.map((entry) => entry.requestId)).toEqual([
      kept.headers.get("x-request-id"),
      replaced.headers.get("x-request-id"),
    ]);
    expect(requestIdFrom("x".repeat(65))).not.toBe("x".repeat(65));
  });

  it("logs health checks at debug, a refusal at warn and a fault at error with the error's name and code", async () => {
    const { app, entries } = appWithLog();
    await app.request("/health");
    await app.request("/refused");
    const failed = await app.request("/boom?token=abc");
    expect(failed.status).toBe(500);
    expect(entries.map((entry) => [entry.level, entry.route, entry.status])).toEqual([
      ["debug", "/health", 200],
      ["warn", "/refused", 403],
      ["error", "/boom", 500],
    ]);
    expect(entries[2]).toMatchObject({ errorName: "Error", errorCode: "ECONNREFUSED" });
    expect(entries[2]?.errorStack).toMatch(/^\s*at /);
    expect(JSON.stringify(entries)).not.toMatch(/jane|abc/);
  });

  it("shows only the words of Better Auth's paths, never a token", async () => {
    const { app, entries } = appWithLog();
    await app.request("/api/auth/reset-password/Tok3nWith1234");
    expect(entries[0]?.route).toBe("/api/auth/reset-password/*");
  });

  it("names a tRPC call's procedures, a batch's too, and never its input", () => {
    expect(proceduresOf("/api/trpc/me.get", "/api/trpc")).toEqual(["me.get"]);
    expect(proceduresOf("/api/trpc/leads.list,notifications.bell", "/api/trpc")).toEqual([
      "leads.list",
      "notifications.bell",
    ]);
    expect(proceduresOf(`/api/trpc/${email}`, "/api/trpc")).toEqual(["?"]);
  });
});
