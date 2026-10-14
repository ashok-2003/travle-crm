// The rate limiter counts hits per key in fixed windows, in Postgres, so every api instance counts against the same
// limit. Keys are stored hashed, never as the IP addresses they contain.
import { createHash, createHmac } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createRateLimiter, purgeExpiredRateLimits } from "../../src/rate-limits/index.js";

const keySecret = "rate-limit-test-secret-of-32-bytes!";
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
    const limiter = createRateLimiter(db, { keySecret });
    const key = `share-links:${crypto.randomUUID()}`;
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
    const limiter = createRateLimiter(db, { keySecret });
    const key = `share-links:${crypto.randomUUID()}`;
    for (const second of [0, 1, 2, 3]) await limiter.hit(key, rule, secondsLater(second));
    expect(await limiter.hit(key, rule, secondsLater(60))).toMatchObject({ allowed: true, remaining: 2 });
    const hashedKey = createHmac("sha256", keySecret).update(key).digest("hex");
    const rows = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ where: { key: hashedKey } }));
    expect(rows).toEqual([{ key: hashedKey, windowStart: secondsLater(60), count: 1 }]);
  });

  it("counts hits from two api instances against one limit", async () => {
    const key = `webhooks:${crypto.randomUUID()}`;
    const first = createRateLimiter(db, { keySecret });
    const second = createRateLimiter(otherInstance, { keySecret });
    await first.hit(key, rule, secondsLater(0));
    await second.hit(key, rule, secondsLater(1));
    await first.hit(key, rule, secondsLater(2));
    expect((await second.hit(key, rule, secondsLater(3))).allowed).toBe(false);
  });

  it("stores a keyed hash of the key, never the address in it or its plain hash", async () => {
    const address = `203.0.113.${String(Math.floor(Math.random() * 200))}`;
    const key = `share-links:${address}`;
    await createRateLimiter(db, { keySecret }).hit(key, rule, secondsLater(0));
    const keys = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ select: { key: true } }));
    expect(keys.every((row) => /^[0-9a-f]{64}$/.test(row.key))).toBe(true);
    expect(keys.some((row) => row.key.includes(address))).toBe(false);
    const stored = keys.map((row) => row.key);
    expect(stored).toContain(createHmac("sha256", keySecret).update(key).digest("hex"));
    // An unkeyed hash of an address can be reversed by trying every address; the keyed one can't.
    expect(stored).not.toContain(createHash("sha256").update(key).digest("hex"));
  });

  it("refuses to store a key that isn't a hash, whatever the code does", async () => {
    await expect(
      db.withoutOrg(
        (tx) =>
          tx.$executeRaw`INSERT INTO rate_limit_counter (key, window_start, count) VALUES ('203.0.113.9', now(), 1)`,
      ),
    ).rejects.toThrow(/rate_limit_counter_key_hash/);
  });

  it("keeps separate buckets for limiters with different secrets", async () => {
    const key = `share-links:${crypto.randomUUID()}`;
    const first = createRateLimiter(db, { keySecret });
    const second = createRateLimiter(db, { keySecret: "another-secret-of-at-least-32-bytes!!" });
    for (const second_ of [0, 1, 2]) await first.hit(key, rule, secondsLater(second_));
    expect((await first.hit(key, rule, secondsLater(3))).allowed).toBe(false);
    expect(await second.hit(key, rule, secondsLater(4))).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("needs a secret of at least 32 bytes", () => {
    expect(() => createRateLimiter(db, { keySecret: "short" })).toThrow(RangeError);
    expect(() => createRateLimiter(db, { keySecret: new Uint8Array(31) })).toThrow(RangeError);
    expect(() => createRateLimiter(db, { keySecret: new Uint8Array(32) })).not.toThrow();
  });

  it("allows exactly the limit when many hits arrive at once from two instances", async () => {
    const key = `share-links:${crypto.randomUUID()}`;
    const first = createRateLimiter(db, { keySecret });
    const second = createRateLimiter(otherInstance, { keySecret });
    const concurrentRule = { limit: 5, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? first : second).hit(key, concurrentRule, secondsLater(0)),
      ),
    );
    expect(results.filter((result) => result.allowed).length).toBe(5);
    const hashedKey = createHmac("sha256", keySecret).update(key).digest("hex");
    const rows = await db.withoutOrg((tx) => tx.rateLimitCounter.findMany({ where: { key: hashedKey } }));
    expect(rows.map((row) => row.count)).toEqual([20]);
  });

  it("doesn't ask the database again for a refused key until its window ends", async () => {
    let calls = 0;
    const counting = {
      withoutOrg: ((...args: Parameters<Database["withoutOrg"]>) => {
        calls += 1;
        return db.withoutOrg(...args);
      }) as Database["withoutOrg"],
    };
    const limiter = createRateLimiter(counting, { keySecret });
    const key = `share-links:${crypto.randomUUID()}`;
    for (const second of [0, 1, 2]) await limiter.hit(key, rule, secondsLater(second));
    expect((await limiter.hit(key, rule, secondsLater(3))).allowed).toBe(false);
    const callsWhenRefused = calls;
    expect(await limiter.hit(key, rule, secondsLater(20))).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 40,
    });
    expect((await limiter.hit(key, rule, secondsLater(59))).allowed).toBe(false);
    expect(calls).toBe(callsWhenRefused);
    expect(await limiter.hit(key, rule, secondsLater(60))).toMatchObject({ allowed: true, remaining: 2 });
    expect(calls).toBeGreaterThan(callsWhenRefused);
  });

  it("purges windows that ended before a time, for the daily clean-up", async () => {
    const limiter = createRateLimiter(db, { keySecret });
    const key = `share-links:${crypto.randomUUID()}`;
    await limiter.hit(key, rule, new Date("2020-01-01T00:00:00Z"));
    expect(await purgeExpiredRateLimits(db, new Date("2021-01-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
    expect(await limiter.hit(key, rule, new Date("2020-01-01T00:00:10Z"))).toMatchObject({ remaining: 2 });
  });

  it("purges a large table in batches", async () => {
    const old = new Date("2019-01-01T00:00:00Z");
    await db.withoutOrg(
      (tx) => tx.$executeRaw`INSERT INTO rate_limit_counter (key, window_start, count)
        SELECT md5(g::text) || md5((g + 1)::text), ${old}, 1 FROM generate_series(1, 25000) AS g`,
    );
    expect(await purgeExpiredRateLimits(db, new Date("2019-06-01T00:00:00Z"), 10_000)).toBe(25_000);
    const left = await db.withoutOrg((tx) => tx.rateLimitCounter.count({ where: { windowStart: old } }));
    expect(left).toBe(0);
  });

  it("refuses a batch size that isn't a whole number from 1 to 100,000", async () => {
    const olderThan = new Date("2000-01-01T00:00:00Z");
    for (const batchSize of [0, -5, 1.5, 100_001, Number.NaN]) {
      await expect(purgeExpiredRateLimits(db, olderThan, batchSize)).rejects.toThrow(RangeError);
    }
  });

  it("lets the runtime role count hits but not change a key or window, and keeps the platform role out", async () => {
    await createRateLimiter(db, { keySecret }).hit(`share-links:${crypto.randomUUID()}`, rule, secondsLater(0));
    await expect(
      db.withoutOrg((tx) => tx.$executeRaw`UPDATE rate_limit_counter SET key = repeat('a', 64)`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withoutOrg((tx) => tx.$executeRaw`UPDATE rate_limit_counter SET window_start = now()`),
    ).rejects.toThrow(/permission denied/i);
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      await expect(platform.$queryRaw`SELECT count(*) FROM rate_limit_counter`).rejects.toThrow(/permission denied/i);
    } finally {
      await platform.$disconnect();
    }
  });

  it("refuses a rule that isn't a positive whole limit and window", async () => {
    const limiter = createRateLimiter(db, { keySecret });
    await expect(limiter.hit("k", { limit: 0, windowSeconds: 60 })).rejects.toThrow(RangeError);
    await expect(limiter.hit("k", { limit: 5, windowSeconds: 1.5 })).rejects.toThrow(RangeError);
  });
});
