// Suspensions made by hand from the console (spec 7.3): platform staff suspend an organization whatever it has paid;
// no payment lifts that, only a super admin, and the organization's own log records who lifted it and why.
import type { PlanSummary, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { createPlan } from "@travel-crm/domain/platform";
import { startSubscription } from "@travel-crm/domain/subscriptions";
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

const todayInIndia = () => calendarDateIn(new Date(), "Asia/Kolkata");

describe("the console's suspensions made by hand", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let plan: PlanSummary;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    plan = await createPlan(
      testConsole.services,
      { userId: superAdmin.userId },
      {
        key: `starter-${crypto.randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        yearlyPricePaise: null,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000,
        modules: ["crm"],
      },
    );
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  async function subscribedOrganization(): Promise<string> {
    const organizationId = await createTestOrganization(server.platform, "Subscriber");
    const start = {
      organizationId,
      planId: plan.id,
      billingCycle: "monthly",
      trialEndsOn: null,
      paidThrough: addDays(todayInIndia(), 365),
    } as const;
    await testConsole.services.platformDb.transaction((tx) => startSubscription(tx, { userId: support.userId }, start));
    return organizationId;
  }

  const shown = async (organizationId: string) =>
    dataOf<SubscriptionWithPayments>(
      await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId }),
    );

  it("keeps a suspension made by hand through a payment, until a super admin lifts it", async () => {
    const organizationId = await subscribedOrganization();
    await dataOf(
      await consoleMutate(testConsole, "subscriptions.suspend", { organizationId, reason: "Chargeback" }, support.jar),
    );
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        {
          organizationId,
          amountPaise: 250_000,
          paidOn: todayInIndia(),
          paidThrough: addDays(todayInIndia(), 400),
          reference: null,
        },
        support.jar,
      ),
    );
    expect((await shown(organizationId)).subscription).toMatchObject({
      status: "suspended",
      manualSuspension: { by: support.userId, reason: "Chargeback" },
    });
    const lift = { organizationId, reason: "Bank confirmed the payment" };
    expect(
      await refusalOf(await consoleMutate(testConsole, "subscriptions.liftSuspension", lift, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(
      await dataOf(await consoleMutate(testConsole, "subscriptions.liftSuspension", lift, superAdmin.jar)),
    ).toMatchObject({ status: "active", manualSuspension: null });
    const lifted = await server.platform.auditEntry.findFirst({
      where: { organizationId, action: "subscription.suspension-lifted" },
    });
    expect(lifted).toMatchObject({ source: "platform", actorUserId: superAdmin.userId });
  });
});
