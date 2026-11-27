// @vitest-environment node
// Whether the agency shows the verified tick: active and paid through today or later, and never the demo.
import type { SubscriptionOverview, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { parseCalendarDate } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { isVerified } from "@/subscription/verified";

const today = parseCalendarDate("2026-10-16");

function overview(status: SubscriptionStatus, paidThrough: string | null, planKey = "growth"): SubscriptionOverview {
  return {
    status,
    access: "full",
    planName: "Growth",
    planKey,
    modules: [],
    trialEndsOn: null,
    paidThrough,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000_000 },
  };
}

describe("isVerified", () => {
  it("is true for an active agency paid through today or later", () => {
    expect(isVerified(overview("active", "2026-10-16"), today)).toBe(true);
    expect(isVerified(overview("active", "2027-01-15"), today)).toBe(true);
  });

  it("is false paid through yesterday, on a trial, past due, read-only, suspended or cancelled", () => {
    expect(isVerified(overview("active", "2026-10-15"), today)).toBe(false);
    expect(isVerified(overview("active", null), today)).toBe(false);
    for (const status of ["trial", "past_due", "read_only", "suspended", "cancelled"] as const) {
      expect(isVerified(overview(status, "2027-01-15"), today)).toBe(false);
    }
  });

  it("is false for the demo's own plan, however paid", () => {
    expect(isVerified(overview("active", "2027-01-15", "platform-demo"), today)).toBe(false);
  });
});
