// The lifecycle's rules (spec 7.3) on calendar days: a trial or a paid period ends, then 7 days past due, 14 read-only,
// then suspended until a person acts, however long ago the daily job last ran.
import { describe, expect, it } from "vitest";
import { parseCalendarDate as day } from "../../src/kernel/index.js";
import { dueState, nextStep, type LifecycleState } from "../../src/subscriptions/index.js";

const policy = { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 };
const state = (fields: Partial<LifecycleState>): LifecycleState => ({
  status: "active",
  since: day("2026-01-01"),
  trialEndsOn: null,
  paidThrough: null,
  ...fields,
});

describe("the subscription lifecycle", () => {
  it("is past due the day after a trial or a paid period ends", () => {
    expect(nextStep(state({ status: "trial", trialEndsOn: day("2026-10-30") }), policy)).toEqual({
      status: "past_due",
      on: "2026-10-31",
    });
    expect(nextStep(state({ paidThrough: day("2026-10-31") }), policy)).toEqual({
      status: "past_due",
      on: "2026-11-01",
    });
  });

  it("is past due for the policy's days, then read-only for its days, then suspended", () => {
    const pastDue = state({ status: "past_due", since: day("2026-11-01") });
    expect(nextStep(pastDue, policy)).toEqual({ status: "read_only", on: "2026-11-08" });
    expect(dueState(pastDue, policy, day("2026-11-07")).status).toBe("past_due");
    expect(dueState(pastDue, policy, day("2026-11-08"))).toMatchObject({ status: "read_only", since: "2026-11-08" });
    const readOnly = state({ status: "read_only", since: day("2026-11-08") });
    expect(nextStep(readOnly, policy)).toEqual({ status: "suspended", on: "2026-11-22" });
    expect(nextStep(readOnly, { ...policy, readOnlyDays: 30 })).toEqual({ status: "suspended", on: "2026-12-08" });
  });

  it("leaves suspended and cancelled to a person", () => {
    expect(nextStep(state({ status: "suspended" }), policy)).toBeNull();
    expect(nextStep(state({ status: "cancelled" }), policy)).toBeNull();
    expect(dueState(state({ status: "cancelled" }), policy, day("2030-01-01")).status).toBe("cancelled");
  });

  it("catches up every missed step, each counted from the day the one before began", () => {
    const paidToAugust = state({ paidThrough: day("2026-08-31"), since: day("2026-08-01") });
    expect(dueState(paidToAugust, policy, day("2026-10-16"))).toEqual({
      status: "suspended",
      since: "2026-09-22",
      trialEndsOn: null,
      paidThrough: "2026-08-31",
    });
  });

  it("stays put while the paid period lasts, and has no next step without a paid-through day", () => {
    const paid = state({ paidThrough: day("2026-12-31") });
    expect(dueState(paid, policy, day("2026-12-31"))).toEqual(paid);
    expect(nextStep(state({}), policy)).toBeNull();
  });
});
