// What an organization may use today (spec 7.2): its plan's modules and limits plus its overrides, and its lifecycle
// state as of today in its own time zone, even before the daily job records it.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSubscriptionAccess, overviewOf, setOverrides } from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const october16 = new Date("2026-10-16T06:00:00Z");

describe("entitlements", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test, { name: "Starter", seatLimit: 5, modules: ["crm"] });
  });

  afterAll(async () => {
    await test.close();
  });

  const accessAt = (now: Date) => createSubscriptionAccess({ db: test.db, now: () => now });

  it("are the plan's modules and limits, plus the overrides", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-10-31" },
      { now: october16 },
    );
    await test.platformDb.transaction((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: null, extraModules: ["quotes"] }),
    );
    const entitlements = await accessAt(october16).entitlementsOf(organizationId);
    expect(entitlements && overviewOf(entitlements)).toEqual({
      status: "active",
      access: "full",
      planName: "Starter",
      modules: ["crm", "quotes"],
      trialEndsOn: null,
      paidThrough: "2026-10-31",
      nextChangeOn: "2026-11-01",
      limits: { seats: 7, whatsappNumbers: 1, storageBytes: 5_000_000_000 },
    });
  });

  it("count the lifecycle up to today, before the daily job has recorded it", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-10-31" },
      { now: october16 },
    );
    // Seven days past due, read-only from 8 November.
    expect(await accessAt(new Date("2026-11-07T06:00:00Z")).entitlementsOf(organizationId)).toMatchObject({
      status: "past_due",
      access: "full",
      nextChangeOn: "2026-11-08",
    });
    expect(await accessAt(new Date("2026-11-08T06:00:00Z")).entitlementsOf(organizationId)).toMatchObject({
      status: "read_only",
      access: "read_only",
      nextChangeOn: "2026-11-22",
    });
  });

  it("turn over at midnight in the organization's own time zone", async () => {
    const trialToOctober16 = { trialEndsOn: "2026-10-16", paidThrough: null };
    const india = await createSubscribedOrganization(test, plan, trialToOctober16, { now: october16 });
    const london = await createSubscribedOrganization(test, plan, trialToOctober16, {
      now: october16,
      timeZone: "Europe/London",
    });
    // 00:30 on 17 October in India; 19:00 on the 16th in London.
    const justAfterMidnightInIndia = accessAt(new Date("2026-10-16T19:00:00Z"));
    expect(await justAfterMidnightInIndia.entitlementsOf(india)).toMatchObject({ status: "past_due" });
    expect(await justAfterMidnightInIndia.entitlementsOf(london)).toMatchObject({ status: "trial" });
  });

  it("are null for an organization without a subscription", async () => {
    const organizationId = await createTestOrganization(test.platform, "Unsubscribed");
    expect(await accessAt(october16).entitlementsOf(organizationId)).toBeNull();
  });
});
