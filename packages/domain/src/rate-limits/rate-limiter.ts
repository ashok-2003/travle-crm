// Fixed-window rate limits kept in Postgres (spec 9.7), so every api instance counts against the same limit.
import { createHmac } from "node:crypto";
import type { Database } from "@travel-crm/db";
import { rateLimitCounters } from "@travel-crm/db/rate-limits";

/** At most `limit` hits per key in each window of `windowSeconds`. */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits left in this window. */
  remaining: number;
  /** Seconds until the next window opens, when refused; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one hit for key, e.g. "share-links:203.0.113.7", and says whether it is within the rule. */
  hit(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>;
}

export interface RateLimiterOptions {
  /**
   * Secret the stored keys are hashed with (HMAC-SHA256), at least 32 bytes. With it the table can't be turned back
   * into client addresses by trying every address. Changing it only resets the counts.
   */
  keySecret: Uint8Array | string;
}

const MIN_SECRET_BYTES = 32;
/** Refused keys remembered per limiter; the oldest are forgotten first. */
const MAX_REMEMBERED_KEYS = 10_000;
const PURGE_BATCH_SIZE = 10_000;
const MAX_PURGE_BATCH_SIZE = 100_000;

function assertRule({ limit, windowSeconds }: RateLimitRule): void {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new RangeError(
      `A rate limit needs a whole limit and window of at least 1, got ${String(limit)}/${String(windowSeconds)}s`,
    );
  }
}

function assertSecret(secret: Uint8Array | string): void {
  const bytes = typeof secret === "string" ? Buffer.byteLength(secret) : secret.byteLength;
  if (bytes < MIN_SECRET_BYTES) {
    throw new RangeError(
      `The rate-limit key secret needs at least ${String(MIN_SECRET_BYTES)} bytes, got ${String(bytes)}`,
    );
  }
}

export function createRateLimiter(db: Pick<Database, "withoutOrg">, { keySecret }: RateLimiterOptions): RateLimiter {
  assertSecret(keySecret);
  /** Keys carry client addresses: only their keyed hash is stored. */
  const hashOf = (key: string) => createHmac("sha256", keySecret).update(key).digest("hex");
  /** Hashed key -> when its refusal ends (ms). A refused key skips the database until then. */
  const refusedUntil = new Map<string, number>();

  return {
    async hit(key, rule, now = new Date()) {
      assertRule(rule);
      const windowMilliseconds = rule.windowSeconds * 1000;
      const windowStart = new Date(Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds);
      const nextWindowAt = windowStart.getTime() + windowMilliseconds;
      const hashedKey = hashOf(key);
      const remembered = refusedUntil.get(hashedKey);
      if (remembered !== undefined) {
        if (remembered > now.getTime() && remembered === nextWindowAt) {
          return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((remembered - now.getTime()) / 1000) };
        }
        refusedUntil.delete(hashedKey);
      }
      const count = await db.withoutOrg(async (tx) => {
        // The key's finished windows are no longer needed; deleting them here keeps busy keys from piling up.
        await rateLimitCounters(tx).deleteMany({ where: { key: hashedKey, windowStart: { lt: windowStart } } });
        const [row] = await tx.$queryRaw<{ count: number }[]>`
          INSERT INTO rate_limit_counter (key, window_start, count) VALUES (${hashedKey}, ${windowStart}, 1)
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counter.count + 1
          RETURNING count`;
        if (!row) throw new Error("The rate-limit counter returned no count");
        return row.count;
      });
      const allowed = count <= rule.limit;
      if (!allowed) {
        if (refusedUntil.size >= MAX_REMEMBERED_KEYS) {
          const oldest = refusedUntil.keys().next();
          if (!oldest.done) refusedUntil.delete(oldest.value);
        }
        refusedUntil.set(hashedKey, nextWindowAt);
      }
      return {
        allowed,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: allowed ? 0 : Math.ceil((nextWindowAt - now.getTime()) / 1000),
      };
    },
  };
}

/** The scheduled job that runs purgeExpiredRateLimits, once a day for the whole platform. */
export const RATE_LIMIT_PURGE_QUEUE = "rate-limits.purge";

/**
 * Deletes the windows that started before olderThan, for the daily clean-up job (it needs no key secret). Works in
 * batches, each in its own short transaction, so a big table doesn't hold one long lock. Returns how many went.
 */
export async function purgeExpiredRateLimits(
  db: Pick<Database, "withoutOrg">,
  olderThan: Date,
  batchSize: number = PURGE_BATCH_SIZE,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_PURGE_BATCH_SIZE) {
    throw new RangeError(`The purge batch size must be a whole number from 1 to ${String(MAX_PURGE_BATCH_SIZE)}`);
  }
  let purged = 0;
  // A concurrent upsert can move a row's ctid, so a batch may delete fewer rows than it found and end the loop early.
  // That is harmless: tomorrow's run finishes the job.
  for (;;) {
    const deleted = await db.withoutOrg(
      (tx) => tx.$executeRaw`
        DELETE FROM rate_limit_counter
        WHERE ctid IN (SELECT ctid FROM rate_limit_counter WHERE window_start < ${olderThan} LIMIT ${batchSize})`,
    );
    purged += deleted;
    if (deleted < batchSize) return purged;
  }
}
