// The demo's own plan in the console (spec 7.4): plans are global, so the demo has a plan that is not for sale. The
// console never lists it as a plan to sell, and onboarding refuses it, whoever asks. Its key is reserved and it can't be
// archived, either of which would stop the nightly reset after it had purged the demo.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { demoPlan } from "@travel-crm/domain/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the demo's plan in the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("is never offered at onboarding: not among the plans on sale, and refused if asked for", async () => {
    const demo = await testConsole.services.platformDb.transaction((tx) => demoPlan(tx));
    const onSale = await dataOf<PlanSummary[]>(await consoleQuery(testConsole, "plans.list", superAdmin.jar, {}));
    expect(onSale.map((plan) => plan.id)).not.toContain(demo.id);
    const everything = await dataOf<PlanSummary[]>(
      await consoleQuery(testConsole, "plans.list", superAdmin.jar, { includeArchived: true }),
    );
    expect(everything.find((plan) => plan.id === demo.id)).toMatchObject({ forSale: false });
    const code = `D${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const onboarding = {
      name: "Not The Demo",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: `hello-${code.toLowerCase()}@example.test`,
      profile: {
        legalName: "Not The Demo LLP",
        gstin: null,
        gstStateCode: "27",
        contactName: null,
        contactPhone: null,
      },
      owner: { name: "Asha Owner", email: `owner-${code.toLowerCase()}@example.test` },
      subscription: {
        planId: demo.id,
        billingCycle: "monthly",
        trialEndsOn: null,
        paidThrough: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30),
      },
    };
    expect(
      await refusalOf(await consoleMutate(testConsole, "organizations.onboard", onboarding, superAdmin.jar)),
    ).toEqual({ status: 409, reason: "PLAN_NOT_FOR_SALE" });
    expect(await server.platform.organization.count({ where: { code } })).toBe(0);
  });

  it("reserves the demo plan's key, and refuses to archive the demo's plan", async () => {
    const demo = await testConsole.services.platformDb.transaction((tx) => demoPlan(tx));
    const lookalike = {
      key: demo.key,
      name: "Demo lookalike",
      monthlyPricePaise: 99_900,
      yearlyPricePaise: null,
      seatLimit: 3,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000_000,
      modules: [],
    };
    expect(await refusalOf(await consoleMutate(testConsole, "plans.create", lookalike, superAdmin.jar))).toEqual({
      status: 409,
      reason: "PLAN_KEY_RESERVED",
    });
    expect(
      await refusalOf(await consoleMutate(testConsole, "plans.archive", { planId: demo.id }, superAdmin.jar)),
    ).toEqual({ status: 409, reason: "DEMO_PLAN_LOCKED" });
    expect(await testConsole.services.platformDb.transaction((tx) => demoPlan(tx))).toMatchObject({ archived: false });
  });
});
