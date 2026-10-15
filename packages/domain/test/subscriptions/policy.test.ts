// The lifecycle's policy (spec 7.3): the trial's, past-due and read-only days, one row the console changes. A change
// to the same days, in whatever order their keys come, changes nothing and so records nothing. The days are never
// changed here: other test files' organizations read the same row while this one runs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSubscriptionPolicy, samePolicy, setSubscriptionPolicy } from "../../src/subscriptions/index.js";
import { byAdmin, createTestSubscriptions, type TestSubscriptions } from "./test-subscriptions.js";

describe("the subscription policy", () => {
  let test: TestSubscriptions;

  beforeAll(() => {
    test = createTestSubscriptions();
  });

  afterAll(async () => {
    await test.close();
  });

  it("holds the owner's 7-day trial beside the spec's 7 past-due and 14 read-only days", async () => {
    expect(await test.platformDb.transaction((tx) => getSubscriptionPolicy(tx))).toEqual({
      trialDays: 7,
      pastDueDays: 7,
      readOnlyDays: 14,
    });
  });

  it("finds no change in the same days, whatever the order of their keys", async () => {
    const reordered = { readOnlyDays: 14, trialDays: 7, pastDueDays: 7 };
    expect(await test.platformDb.transaction((tx) => setSubscriptionPolicy(tx, byAdmin, reordered))).toMatchObject({
      changed: false,
    });
    expect(samePolicy({ trialDays: 7, pastDueDays: 7, readOnlyDays: 14 }, { ...reordered, trialDays: 14 })).toBe(false);
  });
});
