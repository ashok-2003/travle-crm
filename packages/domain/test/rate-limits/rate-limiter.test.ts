// The rate limiter counts hits per key in fixed windows, in Postgres, so every api instance counts against the same
// limit. Keys are stored hashed, never as the IP addresses they contain.
import { createHash } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createRateLimiter } from "../../src/rate-limits/index.js";

const rule = { limit: 3, windowSeconds: 60 };
const windowOpens = new Date("2026-10-15T10:00:00Z");
const secondsLater = (seconds: number) => new Date(windowOpens.getTime() + seconds * 1000);

describe("rate limiter", () => {
  let db: Database;
  let otherInstance: Database;

  beforeAll(() => {
    const { runtime } = inject("dbUrls");
    db = createDatabase(runtime, { maxConnections: 2 });
    otherInstance = createDatabase(runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await otherInstance.disconnect();
  });

  it("allows the limit within a window, then refuses with the seconds until the next one", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    expect(await limiter.hit(key, rule, secondsLater(0))).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(1))).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(2))).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
    expect(await limiter.hit(key, rule, secondsLater(15))).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });
  });

  it("starts again in the next window, and keeps no older windows for the key", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    for (const second of [0, 1, 2, 3]) await limiter.hit(key, rule, secondsLater(second));
    expect(await limiter.hit(key, rule, secondsLater(60))).toMatchObject({ allowed: true, remaining: 2 });
    const hashedKey = createHash("sha256").update(key).digest("hex");
    const rows = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ where: { key: hashedKey } }));
    expect(rows).toEqual([{ key: hashedKey, windowStart: secondsLater(60), count: 1 }]);
  });

  it("counts hits from two api instances against one limit", async () => {
    const key = `webhooks:${crypto.randomUUID()}`;
    const first = createRateLimiter(db);
    const second = createRateLimiter(otherInstance);
    await first.hit(key, rule, secondsLater(0));
    await second.hit(key, rule, secondsLater(1));
    await first.hit(key, rule, secondsLater(2));
    expect((await second.hit(key, rule, secondsLater(3))).allowed).toBe(false);
  });

  it("stores a hash of the key, not the address in it", async () => {
    const address = `203.0.113.${String(Math.floor(Math.random() * 200))}`;
    await createRateLimiter(db).hit(`share-link:${address}`, rule, secondsLater(0));
    const keys = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ select: { key: true } }));
    expect(keys.every((row) => /^[0-9a-f]{64}$/.test(row.key))).toBe(true);
    expect(keys.some((row) => row.key.includes(address))).toBe(false);
  });

  it("purges windows that ended before a time, for the daily clean-up", async () => {
    const limiter = createRateLimiter(db);
    const key = `share-link:${crypto.randomUUID()}`;
    await limiter.hit(key, rule, new Date("2020-01-01T00:00:00Z"));
    expect(await limiter.purgeExpired(new Date("2021-01-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
    expect(await limiter.hit(key, rule, new Date("2020-01-01T00:00:10Z"))).toMatchObject({ remaining: 2 });
  });

  it("refuses a rule that isn't a positive whole limit and window", async () => {
    const limiter = createRateLimiter(db);
    await expect(limiter.hit("k", { limit: 0, windowSeconds: 60 })).rejects.toThrow(RangeError);
    await expect(limiter.hit("k", { limit: 5, windowSeconds: 1.5 })).rejects.toThrow(RangeError);
  });
});
