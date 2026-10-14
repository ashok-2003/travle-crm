// Fixed-window rate limits kept in Postgres (spec 9.7), so every api instance counts against the same limit.
import { createHash } from "node:crypto";
import type { Database } from "@travel-crm/db";

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
  /** Counts one hit for key, e.g. "share-link:203.0.113.7", and says whether it is within the rule. */
  hit(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>;
  /** Deletes the windows that started before olderThan, for a daily clean-up job. Returns how many went. */
  purgeExpired(olderThan: Date): Promise<number>;
}

function assertRule({ limit, windowSeconds }: RateLimitRule): void {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new RangeError(
      `A rate limit needs a whole limit and window of at least 1, got ${String(limit)}/${String(windowSeconds)}s`,
    );
  }
}

/** Keys hold client addresses: only their hash is stored. */
function hashOf(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function createRateLimiter(db: Pick<Database, "withoutOrg">): RateLimiter {
  return {
    async hit(key, rule, now = new Date()) {
      assertRule(rule);
      const windowMilliseconds = rule.windowSeconds * 1000;
      const windowStart = new Date(Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds);
      const hashedKey = hashOf(key);
      const count = await db.withoutOrg(async (tx) => {
        // The key's finished windows are no longer needed; deleting them here keeps busy keys from piling up.
        await tx.rateLimitCounter.deleteMany({ where: { key: hashedKey, windowStart: { lt: windowStart } } });
        const [row] = await tx.$queryRaw<{ count: number }[]>`
          INSERT INTO rate_limit_counter (key, window_start, count) VALUES (${hashedKey}, ${windowStart}, 1)
          ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counter.count + 1
          RETURNING count`;
        if (!row) throw new Error("The rate-limit counter returned no count");
        return row.count;
      });
      const allowed = count <= rule.limit;
      const nextWindowAt = windowStart.getTime() + windowMilliseconds;
      return {
        allowed,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: allowed ? 0 : Math.ceil((nextWindowAt - now.getTime()) / 1000),
      };
    },
    async purgeExpired(olderThan) {
      const { count } = await db.withoutOrg((tx) =>
        tx.rateLimitCounter.deleteMany({ where: { windowStart: { lt: olderThan } } }),
      );
      return count;
    },
  };
}
