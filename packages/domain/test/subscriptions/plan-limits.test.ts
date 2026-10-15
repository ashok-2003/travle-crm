// The plan's limits as the identity and files modules take them (spec 7.2): the seats, extra seats included, and the
// storage. An organization without a subscription has none here; check 2 refuses its every change anyway.
import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { planLimits, type Entitlements, type SubscriptionAccess } from "../../src/subscriptions/index.js";

const growth: Entitlements = {
  status: "active",
  access: "full",
  planName: "Growth",
  modules: new Set(["crm"]),
  limits: { seats: 7, whatsappNumbers: 1, storageBytes: 5_000_000 },
  trialEndsOn: null,
  paidThrough: parseCalendarDate("2026-12-31"),
  nextChangeOn: parseCalendarDate("2027-01-01"),
};

const accessTo = (byOrganization: Record<string, Entitlements>): SubscriptionAccess => ({
  entitlementsOf: (organizationId) => Promise.resolve(byOrganization[organizationId] ?? null),
});

describe("the plan's limits", () => {
  it("gives each organization the seats and storage of its plan", async () => {
    const limits = planLimits(accessTo({ "organization-a": growth }));
    expect(await limits.seats("organization-a")).toBe(7);
    expect(await limits.storageBytes("organization-a")).toBe(5_000_000);
  });

  it("sets none for an organization without a subscription", async () => {
    const limits = planLimits(accessTo({}));
    expect(await limits.seats("organization-b")).toBeNull();
    expect(await limits.storageBytes("organization-b")).toBeNull();
  });
});
