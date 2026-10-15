// How the data layer treats the api's answers: refusals aren't retried, a 401 signs the person out, a pending step
// sends them to take it, and anything else is left to the screen that made the call.
import { describe, expect, it, vi } from "vitest";
import { isWorthRetrying, refusalOf } from "@/data/api-error";
import { handleRefusal } from "@/data/query-client";
import { refusal, unanswered } from "../support/api-errors";

describe("refusalOf", () => {
  it("reads the status and domain reason the api sent", () => {
    expect(refusalOf(refusal(403, "MISSING_PERMISSION"))).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(refusalOf(refusal(401))).toEqual({ status: 401, reason: null });
  });

  it("finds no refusal when the call got no answer", () => {
    expect(refusalOf(unanswered())).toBeNull();
    expect(refusalOf(new Error("boom"))).toBeNull();
  });
});

describe("isWorthRetrying", () => {
  it("retries unanswered calls and server faults, never a refusal", () => {
    expect(isWorthRetrying(unanswered())).toBe(true);
    expect(isWorthRetrying(refusal(500))).toBe(true);
    expect(isWorthRetrying(refusal(403, "MISSING_PERMISSION"))).toBe(false);
    expect(isWorthRetrying(refusal(401))).toBe(false);
  });
});

describe("handleRefusal", () => {
  const handlers = () => ({ onSignedOut: vi.fn(), onPendingStep: vi.fn() });

  it("signs the person out on a 401", () => {
    const spies = handlers();
    handleRefusal(refusal(401), spies);
    expect(spies.onSignedOut).toHaveBeenCalledOnce();
    expect(spies.onPendingStep).not.toHaveBeenCalled();
  });

  it("sends the person to a step the api insists on", () => {
    const spies = handlers();
    handleRefusal(refusal(403, "CHANGE_PASSWORD"), spies);
    handleRefusal(refusal(403, "SET_UP_TWO_FACTOR"), spies);
    expect(spies.onPendingStep.mock.calls).toEqual([["CHANGE_PASSWORD"], ["SET_UP_TWO_FACTOR"]]);
  });

  it("leaves other refusals and failures to the screen", () => {
    const spies = handlers();
    handleRefusal(refusal(403, "MISSING_PERMISSION"), spies);
    handleRefusal(unanswered(), spies);
    expect(spies.onSignedOut).not.toHaveBeenCalled();
    expect(spies.onPendingStep).not.toHaveBeenCalled();
  });
});
