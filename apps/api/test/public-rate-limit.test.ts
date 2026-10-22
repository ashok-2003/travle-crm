// The public routes' rate limit: per limit name and client address, counted in Postgres, answering 429 with
// Retry-After when over. Better Auth's own sign-in limit is tested in rate-limit.test.ts.
import { createDatabase, type Database } from "@travel-crm/db";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { Hono } from "hono";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { apiErrorHandler } from "../src/error-handler.js";
import { clientAddressFrom, rateLimit, resetMissingAddressWarning } from "../src/rate-limit.js";

describe("public rate limit", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  /** What the limits logged: the once-per-process warning, say. */
  const logger = createMemoryLogger();

  /** A tiny app behind the limit, with a name of its own so tests don't share counts. */
  function limitedApp(limit: number, trustedProxies: readonly string[] = []) {
    const app = new Hono();
    app.use(
      rateLimit({
        limiter: createRateLimiter(db, { keySecret: "public-rate-limit-test-secret-32-bytes" }),
        name: `test-${crypto.randomUUID()}`,
        limit,
        windowSeconds: 60,
        clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies }),
        logger,
      }),
    );
    app.get("/", (c) => c.text("ok"));
    return app;
  }

  const from = (address: string) => ({ headers: { "x-forwarded-for": address } });

  it("lets requests through under the limit and says how many are left", async () => {
    const app = limitedApp(2);
    const first = await app.request("/", from("203.0.113.10"));
    expect(first.status).toBe(200);
    expect(first.headers.get("ratelimit-remaining")).toBe("1");
  });

  it("answers 429 with Retry-After once the limit is used up", async () => {
    const app = limitedApp(2);
    await app.request("/", from("203.0.113.11"));
    await app.request("/", from("203.0.113.11"));
    const refused = await app.request("/", from("203.0.113.11"));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.headers.get("ratelimit-remaining")).toBe("0");
    expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED", reason: "RATE_LIMITED" });
  });

  it("answers with the route's own refusal when it has one, still saying when to come back", async () => {
    const app = new Hono();
    app.use(
      rateLimit({
        limiter: createRateLimiter(db, { keySecret: "public-rate-limit-test-secret-32-bytes" }),
        name: `test-${crypto.randomUUID()}`,
        limit: 1,
        windowSeconds: 60,
        clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
        refusal: (retryAfterSeconds) =>
          new Response(`<p>Wait ${String(retryAfterSeconds)} s</p>`, {
            status: 429,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
        logger,
      }),
    );
    app.get("/", (c) => c.text("ok"));
    await app.request("/", from("203.0.113.14"));
    const refused = await app.request("/", from("203.0.113.14"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const retryAfter = refused.headers.get("retry-after");
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(refused.headers.get("ratelimit-remaining")).toBe("0");
    expect(await refused.text()).toBe(`<p>Wait ${String(retryAfter)} s</p>`);
  });

  it("counts each client address on its own", async () => {
    const app = limitedApp(1);
    expect((await app.request("/", from("203.0.113.12"))).status).toBe(200);
    expect((await app.request("/", from("203.0.113.13"))).status).toBe(200);
    expect((await app.request("/", from("203.0.113.12"))).status).toBe(429);
  });

  it("can't be dodged by forging addresses in front of the proxy's", async () => {
    const app = limitedApp(1, ["10.0.0.0/8"]);
    expect((await app.request("/", from("1.1.1.1, 203.0.113.14, 10.0.0.5"))).status).toBe(200);
    expect((await app.request("/", from("2.2.2.2, 203.0.113.14, 10.0.0.5"))).status).toBe(429);
  });

  it("puts requests with no address in one shared bucket instead of letting them through, and warns once", async () => {
    resetMissingAddressWarning();
    logger.entries.length = 0;
    const app = limitedApp(1);
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ level: "warn" });
    expect(logger.entries[0]?.msg).toMatch(/no trusted client address.*load balancer/i);
  });

  it("fails closed when the database is down: a 500, and the route is not reached", async () => {
    let reached = false;
    const failures = createMemoryLogger();
    const app = new Hono();
    // The api's handler: the failure is one line of names, a code and frames in the log.
    app.onError(apiErrorHandler(failures));
    app.use(
      rateLimit({
        limiter: { hit: () => Promise.reject(new Error("rate-limit database down")) },
        name: "test",
        limit: 5,
        windowSeconds: 60,
        clientAddress: () => "203.0.113.30",
        logger,
      }),
    );
    app.get("/", (c) => {
      reached = true;
      return c.text("ok");
    });
    expect((await app.request("/")).status).toBe(500);
    expect(reached).toBe(false);
    expect(failures.entries).toHaveLength(1);
    expect(failures.entries[0]).toMatchObject({
      level: "error",
      msg: "unhandled error",
      method: "GET",
      errorName: "Error",
    });
  });
});

describe("clientAddressFrom", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  const forwarded = (value: string) => request({ "x-forwarded-for": value });
  const behindProxies = clientAddressFrom({
    headerNames: ["x-forwarded-for"],
    trustedProxies: ["10.0.0.0/8", "2001:db8:ffff::1"],
  });
  const direct = clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] });

  it("behind trusted proxies, takes the first address from the right that isn't a proxy", () => {
    expect(behindProxies(forwarded("203.0.113.20, 10.0.0.5"))).toBe("203.0.113.20");
    // The leftmost values are whatever the client sent: a forged one is ignored.
    expect(behindProxies(forwarded("6.6.6.6, 203.0.113.20, 10.1.2.3"))).toBe("203.0.113.20");
    expect(behindProxies(forwarded("203.0.113.20, ::ffff:10.0.0.5, 2001:db8:ffff::1"))).toBe("203.0.113.20");
    expect(behindProxies(forwarded("10.0.0.7, 10.0.0.5"))).toBeNull();
    expect(behindProxies(forwarded("203.0.113.20, nonsense, 10.0.0.5"))).toBeNull();
  });

  it("without trusted proxies, believes only a header holding exactly one valid address", () => {
    expect(direct(forwarded(" 203.0.113.20 "))).toBe("203.0.113.20");
    expect(direct(forwarded("6.6.6.6, 203.0.113.20"))).toBeNull();
    expect(direct(forwarded("nonsense"))).toBeNull();
    expect(direct(forwarded(" , "))).toBeNull();
    expect(direct(request({}))).toBeNull();
  });

  it("reads the first configured header that is present, and only that one", () => {
    const address = clientAddressFrom({ headerNames: ["cf-connecting-ip", "x-forwarded-for"], trustedProxies: [] });
    expect(address(request({ "cf-connecting-ip": "198.51.100.5", "x-forwarded-for": "203.0.113.20" }))).toBe(
      "198.51.100.5",
    );
    expect(address(request({ "x-forwarded-for": "203.0.113.20" }))).toBe("203.0.113.20");
    expect(address(request({ "cf-connecting-ip": "6.6.6.6, 7.7.7.7", "x-forwarded-for": "203.0.113.20" }))).toBeNull();
  });

  it("writes IPv4-mapped IPv6 as IPv4, and counts one IPv6 /64 as one client", () => {
    expect(direct(forwarded("::ffff:198.51.100.5"))).toBe("198.51.100.5");
    expect(direct(forwarded("2001:db8:85a3:1::1"))).toBe("2001:db8:85a3:1::");
    expect(direct(forwarded("2001:0DB8:85A3:0001:ffff:ffff:ffff:2"))).toBe("2001:db8:85a3:1::");
    expect(direct(forwarded("2001:db8:85a3:2::1"))).toBe("2001:db8:85a3:2::");
    expect(direct(forwarded("fe80::1%eth0"))).toBeNull();
  });

  it("refuses a trusted-proxy setting that isn't an IP address or CIDR range", () => {
    for (const trustedProxies of [["10.0.0.0/33"], ["example.com"], ["10.0.0.0/"], ["10.0.0.0/8/8"]]) {
      expect(() => clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies })).toThrow(RangeError);
    }
  });
});
