// How much an agency may make us ask Google by hand (SD4, SC2, R3): the connect steps, Check again and Sync now each read the
// sheet on the one shared service account, whose quota is 60 requests a minute. So the budget counts Google's requests,
// not calls: each call costs what it will ask Google for, and an agency may spend a share of the account's minute. Past it
// the agency is told to wait, and no agency can push every other into Google's 429.
import type { RateLimiter } from "../rate-limits/index.js";
import { DomainError } from "../kernel/index.js";

/** A third of an account's 60 requests a minute: the rest is for the checks of the schedule and for other agencies. */
export const sheetRequestsPerMinute = 20;

/** What each by-hand call asks Google for, at most (a describe is two requests, a column read one, a full read three). */
export const requestsOf = {
  /** One describe on each account tried in turn. */
  begin: (accounts: number) => 2 * Math.max(1, accounts),
  chooseTab: 2,
  /** A describe, a column to count the rows, a column of the Owner's values. */
  verify: 4,
  /** A describe of another tab, and the full read of its check. */
  recheck: 5,
  /** The full read of its check. */
  syncNow: 3,
} as const;

export async function limitSheetReads(
  limiter: Pick<RateLimiter, "hit"> | undefined,
  organizationId: string,
  requests: number,
  now: Date = new Date(),
): Promise<void> {
  if (limiter === undefined) return;
  // One hit for each request: the limiter counts hits. A refusal stops at once, with what was counted kept.
  for (let request = 0; request < requests; request += 1) {
    const result = await limiter.hit(
      `sheet-reads:${organizationId}`,
      { limit: sheetRequestsPerMinute, windowSeconds: 60 },
      now,
    );
    if (!result.allowed) {
      throw new DomainError("CONFLICT", "SHEETS_TOO_FAST", "Too many sheet checks in a minute: wait a little");
    }
  }
}
