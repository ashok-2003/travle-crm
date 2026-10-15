// @vitest-environment node
// Which subscriptions shut the organization's screens (spec 7.3: suspended, cancelled, and none at all), and which
// screens stay open anyway: the person's own account, and Staff for the Owner while suspended (ADR 0021).
import type { LifecycleAccess, SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { describe, expect, it } from "vitest";
import { lockOf, staysOpen } from "@/subscription/locks";
import { refusal, unanswered } from "../support/api-errors";

function overview(access: LifecycleAccess): SubscriptionOverview {
  return {
    status: "active",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000_000 },
  };
}

describe("lockOf", () => {
  it("shuts a suspended organization, a cancelled one, and one with no subscription", () => {
    expect(lockOf(overview("export_only"), null)).toBe("suspended");
    expect(lockOf(overview("locked"), null)).toBe("cancelled");
    expect(lockOf(undefined, refusal(403, "NO_SUBSCRIPTION"))).toBe("noSubscription");
  });

  it("leaves the screens open while the subscription loads or can't be read, and in every other state", () => {
    expect(lockOf(undefined, null)).toBeNull();
    expect(lockOf(undefined, unanswered())).toBeNull();
    expect(lockOf(undefined, refusal(500))).toBeNull();
    expect(lockOf(overview("full"), null)).toBeNull();
    expect(lockOf(overview("read_only"), null)).toBeNull();
  });
});

describe("staysOpen", () => {
  it("keeps the person's own account open in every lock, but not the screens below it", () => {
    for (const lock of ["suspended", "cancelled", "noSubscription"] as const) {
      expect(staysOpen(lock, { pathname: "/account", isOwner: false }), lock).toBe(true);
      expect(staysOpen(lock, { pathname: "/account/notifications", isOwner: true }), lock).toBe(false);
    }
  });

  it("lets the Owner reach Staff while suspended, and nobody else, nor any other screen", () => {
    expect(staysOpen("suspended", { pathname: "/staff", isOwner: true })).toBe(true);
    expect(staysOpen("suspended", { pathname: "/staff/new", isOwner: true })).toBe(true);
    expect(staysOpen("suspended", { pathname: "/staffing", isOwner: true })).toBe(false);
    expect(staysOpen("suspended", { pathname: "/staff", isOwner: false })).toBe(false);
    expect(staysOpen("suspended", { pathname: "/settings", isOwner: true })).toBe(false);
    expect(staysOpen("cancelled", { pathname: "/staff", isOwner: true })).toBe(false);
    expect(staysOpen("noSubscription", { pathname: "/staff", isOwner: true })).toBe(false);
  });
});
