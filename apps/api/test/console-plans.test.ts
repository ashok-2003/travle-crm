// The console's plans and subscription policy (spec 7.2, 7.3): every platform staff member sees them, only super
// admins change them, and each change goes in the platform log.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { listPlatformLog } from "@travel-crm/domain/platform";
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

const growth = {
  key: `growth-${crypto.randomUUID().slice(0, 8)}`,
  name: "Growth",
  monthlyPricePaise: 450_000,
  yearlyPricePaise: 4_500_000,
  seatLimit: 15,
  whatsappNumberLimit: 2,
  storageLimitBytes: 20_000_000_000,
  modules: ["crm", "quotes", "bookings"],
};

describe("the console's plans", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("lets a super admin create, change and archive a plan, each in the platform log", async () => {
    const created = await dataOf<PlanSummary>(await consoleMutate(testConsole, "plans.create", growth, superAdmin.jar));
    expect(created).toMatchObject({ ...growth, archived: false });
    const updated = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.update",
        { planId: created.id, ...growth, key: undefined, seatLimit: 20 },
        superAdmin.jar,
      ),
    );
    expect(updated).toMatchObject({ key: growth.key, seatLimit: 20 });
    await dataOf(await consoleMutate(testConsole, "plans.archive", { planId: created.id }, superAdmin.jar));
    const log = await testConsole.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }));
    const entries = log.entries.filter((entry) => entry.targetId === created.id).map((entry) => entry.action);
    expect(entries).toEqual(["plan.archived", "plan.updated", "plan.created"]);
  });

  it("shows support the plans on sale, and refuses them any change", async () => {
    const created = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.create",
        { ...growth, key: `basic-${crypto.randomUUID().slice(0, 8)}` },
        superAdmin.jar,
      ),
    );
    const listed = await dataOf<PlanSummary[]>(await consoleQuery(testConsole, "plans.list", support.jar, {}));
    expect(listed.map((plan) => plan.id)).toContain(created.id);
    expect(
      await refusalOf(await consoleMutate(testConsole, "plans.archive", { planId: created.id }, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
  });

  it("refuses a plan with no price, or with fields it doesn't know", async () => {
    expect(
      (
        await consoleMutate(
          testConsole,
          "plans.create",
          { ...growth, monthlyPricePaise: null, yearlyPricePaise: null },
          superAdmin.jar,
        )
      ).status,
    ).toBe(400);
    expect((await consoleMutate(testConsole, "plans.create", { ...growth, discount: 5 }, superAdmin.jar)).status).toBe(
      400,
    );
  });

  it("shows the subscription policy, and lets only a super admin change it", async () => {
    expect(await dataOf(await consoleQuery(testConsole, "plans.policy", support.jar))).toEqual({
      pastDueDays: 7,
      readOnlyDays: 14,
    });
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 10, readOnlyDays: 20 }, support.jar),
      ),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    try {
      expect(
        await dataOf(
          await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 10, readOnlyDays: 20 }, superAdmin.jar),
        ),
      ).toEqual({ pastDueDays: 10, readOnlyDays: 20 });
    } finally {
      // Other test files rely on the spec's defaults.
      await consoleMutate(testConsole, "plans.setPolicy", { pastDueDays: 7, readOnlyDays: 14 }, superAdmin.jar);
    }
  });
});
