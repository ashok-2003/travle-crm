// Plans are data the console edits (spec 7.2): priced, limited, on known modules; a key is unique and never changes,
// and an archived plan is off sale but kept for the organizations on it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archivePlan, findPlan, listPlans, updatePlan } from "../../src/subscriptions/index.js";
import { createTestPlan, createTestSubscriptions, type TestSubscriptions } from "./test-subscriptions.js";

describe("plans", () => {
  let test: TestSubscriptions;

  beforeAll(() => {
    test = createTestSubscriptions();
  });

  afterAll(async () => {
    await test.close();
  });

  it("creates a plan with its price, limits and modules", async () => {
    const plan = await createTestPlan(test, { name: "Growth", storageLimitBytes: 50_000_000_000, modules: ["crm"] });
    expect(plan).toMatchObject({
      name: "Growth",
      monthlyPricePaise: 250_000,
      seatLimit: 5,
      storageLimitBytes: 50_000_000_000,
      modules: ["crm"],
      archived: false,
    });
    expect(await test.platformDb.transaction((tx) => findPlan(tx, plan.id))).toEqual(plan);
  });

  it("refuses a key another plan has", async () => {
    const plan = await createTestPlan(test);
    await expect(createTestPlan(test, { key: plan.key })).rejects.toMatchObject({ reason: "PLAN_KEY_TAKEN" });
  });

  it("changes a plan's price, limits and modules, keeping its key", async () => {
    const plan = await createTestPlan(test);
    const { before, after } = await test.platformDb.transaction((tx) =>
      updatePlan(tx, {
        planId: plan.id,
        name: "Starter 2027",
        monthlyPricePaise: 300_000,
        yearlyPricePaise: null,
        seatLimit: 8,
        whatsappNumberLimit: 2,
        storageLimitBytes: 10_000_000_000,
        modules: ["crm", "quotes", "bookings"],
      }),
    );
    expect(before).toEqual(plan);
    expect(after).toMatchObject({ key: plan.key, name: "Starter 2027", yearlyPricePaise: null, seatLimit: 8 });
  });

  it("takes an archived plan off the list, unless archived plans are asked for, and archives once", async () => {
    const plan = await createTestPlan(test);
    expect(await test.platformDb.transaction((tx) => archivePlan(tx, plan.id))).toMatchObject({ changed: true });
    expect(await test.platformDb.transaction((tx) => archivePlan(tx, plan.id))).toMatchObject({ changed: false });
    const onSale = await test.platformDb.transaction((tx) => listPlans(tx, { includeArchived: false }));
    expect(onSale.map((listed) => listed.id)).not.toContain(plan.id);
    const all = await test.platformDb.transaction((tx) => listPlans(tx, { includeArchived: true }));
    expect(all.find((listed) => listed.id === plan.id)).toMatchObject({ archived: true });
  });

  it("says when a plan doesn't exist", async () => {
    await expect(
      test.platformDb.transaction((tx) => findPlan(tx, "0199e7a0-0000-7000-8000-0000000000ee")),
    ).rejects.toMatchObject({ reason: "PLAN_NOT_FOUND" });
  });

  it("can't be written by the runtime role, whatever the code does", async () => {
    await expect(test.db.withoutOrg((tx) => listPlans(tx, { includeArchived: true }))).resolves.toBeInstanceOf(Array);
    const plan = await createTestPlan(test);
    await expect(test.db.withoutOrg((tx) => archivePlan(tx, plan.id))).rejects.toThrow(/permission denied/);
  });
});
