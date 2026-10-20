// What an agency may make us ask Google by hand (R3): each call costs its Google requests, a refusal stops the call, and
// the budget is a share of one account's minute.
import { describe, expect, it } from "vitest";
import { limitSheetReads, requestsOf, sheetRequestsPerMinute } from "../../src/sheets/index.js";

/** A limiter that allows the first `limit` hits of a key and counts every one. */
function limiterOf(limit: number) {
  const hits = new Map<string, number>();
  return {
    hits,
    hit: (key: string) => {
      const count = (hits.get(key) ?? 0) + 1;
      hits.set(key, count);
      return Promise.resolve({ allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 });
    },
  };
}

describe("limitSheetReads", () => {
  it("spends one hit for each Google request of a call, per organization", async () => {
    const limiter = limiterOf(sheetRequestsPerMinute);
    await limitSheetReads(limiter, "org-a", requestsOf.verify);
    await limitSheetReads(limiter, "org-a", requestsOf.begin(2));
    await limitSheetReads(limiter, "org-b", requestsOf.syncNow);
    expect(limiter.hits.get("sheet-reads:org-a")).toBe(requestsOf.verify + requestsOf.begin(2));
    expect(limiter.hits.get("sheet-reads:org-b")).toBe(requestsOf.syncNow);
  });

  it("refuses once the budget is spent, and keeps well under an account's 60 requests a minute", async () => {
    expect(sheetRequestsPerMinute).toBeLessThanOrEqual(20);
    const limiter = limiterOf(sheetRequestsPerMinute);
    for (let call = 0; call < 5; call += 1) await limitSheetReads(limiter, "org-a", requestsOf.verify);
    await expect(limitSheetReads(limiter, "org-a", requestsOf.verify)).rejects.toMatchObject({
      reason: "SHEETS_TOO_FAST",
    });
  });

  it("does nothing without a limiter", async () => {
    await expect(limitSheetReads(undefined, "org-a", 4)).resolves.toBeUndefined();
  });
});
