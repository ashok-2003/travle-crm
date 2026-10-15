// What the console sees of a subscription (spec 7.2, 7.3): the state due today beside the one the nightly job last
// recorded, and the price per billing cycle with its extra seats, an agreed price in their place, and GST on top.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSubscription, setOverrides } from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = testNow;

describe("a subscription's details", () => {
  let test: TestSubscriptions;
  let starter: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    starter = await createTestPlan(test, { name: "Starter" });
  });

  afterAll(async () => {
    await test.close();
  });

  const inPlatform = <T>(fn: Parameters<typeof test.platformDb.transaction<T>>[0]) => test.platformDb.transaction(fn);

  it("shows the price per billing cycle before GST, its extra seats, and GST at 18 % on top", async () => {
    const organizationId = await createSubscribedOrganization(test, starter);
    const withSeats = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: null, extraModules: [] }, now),
    );
    // ₹2,500 a month and two seats at ₹500: ₹3,500, and GST of ₹630.
    expect(withSeats.price).toEqual({
      billingCycle: "monthly",
      planPricePaise: 250_000,
      extraSeats: 2,
      extraSeatPricePaise: 50_000,
      listPricePaise: 350_000,
      customPricePaise: null,
      pricePaise: 350_000,
      gstRateBasisPoints: 1800,
      gstPaise: 63_000,
      totalPaise: 413_000,
    });
    const agreed = await inPlatform((tx) =>
      setOverrides(tx, byAdmin, { organizationId, extraSeats: 2, customPricePaise: 299_999, extraModules: [] }, now),
    );
    expect(agreed.price).toMatchObject({ listPricePaise: 350_000, pricePaise: 299_999, gstPaise: 54_000 });
  });

  it("shows the state due today, and what the daily job last recorded", async () => {
    const organizationId = await createSubscribedOrganization(
      test,
      starter,
      { trialEndsOn: "2026-10-10", paidThrough: null },
      { now: new Date("2026-10-01T06:00:00Z") },
    );
    expect(await inPlatform((tx) => getSubscription(tx, organizationId, now))).toMatchObject({
      status: "past_due",
      access: "full",
      since: "2026-10-11",
      nextChangeOn: "2026-10-18",
      recorded: { status: "trial", since: "2026-10-01" },
      manualSuspension: null,
    });
  });
});
