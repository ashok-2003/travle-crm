// A sleeping server (free hosting wakes in about a minute) is told apart from a real answer: only unanswered calls and
// the proxy's 502, 503 or 504 count as waking, and the gates keep trying for about WAKE_BUDGET_MS before failing.
import { describe, expect, it } from "vitest";
import { isServerWaking, isWakingStatus, WAKE_BUDGET_MS, WAKE_RETRY_DELAY_MS, wakingRetry } from "@/data/server-waking";
import { refusal, unanswered } from "../support/api-errors";

describe("isWakingStatus", () => {
  it("counts no answer and the proxy's gateway statuses, never a refusal", () => {
    expect([0, 502, 503, 504].map(isWakingStatus)).toEqual([true, true, true, true]);
    expect([200, 400, 401, 403, 429, 500].map(isWakingStatus)).toEqual([false, false, false, false, false, false]);
  });
});

describe("isServerWaking", () => {
  it("is true for a call that got no answer, or a gateway status with no reason of ours", () => {
    expect(isServerWaking(unanswered())).toBe(true);
    expect(isServerWaking(refusal(504))).toBe(true);
    expect(isServerWaking(refusal(502))).toBe(true);
  });

  it("is false for the api's own answers", () => {
    expect(isServerWaking(refusal(401))).toBe(false);
    expect(isServerWaking(refusal(500))).toBe(false);
    expect(isServerWaking(refusal(503, "STORAGE_UNAVAILABLE"))).toBe(false);
  });
});

describe("wakingRetry", () => {
  it("keeps trying a waking server for about the budget, at a steady pace", () => {
    const tries = WAKE_BUDGET_MS / WAKE_RETRY_DELAY_MS;
    expect(wakingRetry.retry(tries - 1, refusal(504))).toBe(true);
    expect(wakingRetry.retry(tries, refusal(504))).toBe(false);
    expect(wakingRetry.retryDelay(5, unanswered())).toBe(WAKE_RETRY_DELAY_MS);
  });

  it("tries a server fault twice more, backing off, as every query does", () => {
    expect(wakingRetry.retry(1, refusal(500))).toBe(true);
    expect(wakingRetry.retry(2, refusal(500))).toBe(false);
    expect([0, 1].map((failures) => wakingRetry.retryDelay(failures, refusal(500)))).toEqual([1_000, 2_000]);
  });

  it("never retries a refusal", () => {
    expect(wakingRetry.retry(0, refusal(403, "MISSING_PERMISSION"))).toBe(false);
  });
});
