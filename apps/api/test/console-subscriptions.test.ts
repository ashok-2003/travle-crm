// The console's work on an organization's subscription (spec 7.2-7.4): platform staff change its plan and overrides,
// record payments and suspend or cancel it by hand; only a super admin lifts a suspension made by hand, which no
// payment does; the console sees the state due today beside the one recorded, and the price with GST; the
// organization's own audit log shows each change under the platform admin's name. Organization staff reach none of
// it. Dates are relative to today in India, the test agencies' zone. One router end to end over HTTP, so a little
// over the usual length.
import type { PlanSummary, SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
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
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

const today = calendarDateIn(new Date(), "Asia/Kolkata");

describe("the console's subscriptions", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let starter: PlanSummary;
  let growth: PlanSummary;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    const plan = (name: string, modules: PlanSummary["modules"]) =>
      createPlan(
        testConsole.services,
        { userId: superAdmin.userId },
        {
          key: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
          name,
          monthlyPricePaise: 250_000,
          annualPricePaise: 2_500_000,
          includedSeats: 5,
          extraSeatMonthlyPricePaise: 50_000,
          extraSeatAnnualPricePaise: 500_000,
          whatsappNumberLimit: 1,
          storageGb: 5,
          modules,
        },
      );
    starter = await plan("Starter", ["crm"]);
    growth = await plan("Growth", ["crm", "quotes"]);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** An organization the console started on Starter, paid through `paidThrough` (a year from today unless given). */
  async function subscribedOrganization(paidThrough = addDays(today, 365)): Promise<string> {
    const organizationId = await createTestOrganization(server.platform, "Subscriber");
    await testConsole.services.platformDb.transaction((tx) =>
      startSubscription(
        tx,
        { userId: support.userId },
        { organizationId, planId: starter.id, billingCycle: "monthly", trialEndsOn: null, paidThrough },
      ),
    );
    return organizationId;
  }

  const shown = async (organizationId: string) =>
    dataOf<SubscriptionWithPayments>(
      await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId }),
    );

  it("changes the plan and overrides, recorded in the organization's log under the admin's name", async () => {
    const organizationId = await subscribedOrganization();
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.changePlan",
        { organizationId, planId: growth.id, billingCycle: "annual" },
        support.jar,
      ),
    );
    const overridden = await dataOf<SubscriptionDetails>(
      await consoleMutate(
        testConsole,
        "subscriptions.setOverrides",
        { organizationId, extraSeats: 2, customPricePaise: null, extraModules: ["accounts"] },
        support.jar,
      ),
    );
    // ₹25,000 a year and two seats at ₹5,000: ₹35,000 before GST, and ₹6,300 of GST.
    expect(overridden).toMatchObject({
      plan: { id: growth.id },
      billingCycle: "annual",
      extraSeats: 2,
      extraModules: ["accounts"],
      price: { listPricePaise: 3_500_000, pricePaise: 3_500_000, gstPaise: 630_000, totalPaise: 4_130_000 },
    });
    const entries = await server.platform.auditEntry.findMany({
      where: { organizationId, entityType: "subscription" },
      orderBy: { id: "asc" },
    });
    expect(entries.map((entry) => [entry.action, entry.source, entry.actorUserId])).toEqual([
      ["subscription.started", "platform", support.userId],
      ["subscription.plan-changed", "platform", support.userId],
      ["subscription.overrides-changed", "platform", support.userId],
    ]);
  });

  it("shows the state due today beside the one recorded, records a payment, and cancels by hand", async () => {
    // Paid through four weeks ago: suspended today, though nothing recorded it.
    const organizationId = await subscribedOrganization(today);
    await server.platform.subscription.update({
      where: { organizationId },
      data: { paidThrough: new Date(`${addDays(today, -28)}T00:00:00Z`) },
    });
    expect((await shown(organizationId)).subscription).toMatchObject({
      status: "suspended",
      access: "export_only",
      recorded: { status: "active" },
    });
    const payment = await dataOf<{ id: string }>(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        { organizationId, amountPaise: 250_000, paidOn: today, paidThrough: addDays(today, 30), reference: "UPI 6123" },
        support.jar,
      ),
    );
    const afterPaying = await shown(organizationId);
    expect(afterPaying.subscription).toMatchObject({ status: "active", recorded: { status: "active", since: today } });
    expect(afterPaying.payments.map((listed) => listed.id)).toEqual([payment.id]);
    expect(
      await dataOf(
        await consoleMutate(
          testConsole,
          "subscriptions.cancel",
          { organizationId, reason: "Closing down" },
          support.jar,
        ),
      ),
    ).toMatchObject({ status: "cancelled", access: "locked" });
  });

  it("keeps a suspension made by hand through a payment, until a super admin lifts it", async () => {
    const organizationId = await subscribedOrganization();
    await dataOf(
      await consoleMutate(testConsole, "subscriptions.suspend", { organizationId, reason: "Chargeback" }, support.jar),
    );
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        { organizationId, amountPaise: 250_000, paidOn: today, paidThrough: addDays(today, 400), reference: null },
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

  it("says when an organization has no subscription, and refuses a reason left blank", async () => {
    const organizationId = await createTestOrganization(server.platform, "Unsubscribed");
    expect(
      await refusalOf(await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId })),
    ).toEqual({ status: 404, reason: "SUBSCRIPTION_NOT_FOUND" });
    expect(
      (await consoleMutate(testConsole, "subscriptions.suspend", { organizationId, reason: "" }, support.jar)).status,
    ).toBe(400);
  });

  it("is out of reach of an organization's own staff", async () => {
    const agency = await createTestAgency(server);
    const owner = await signedInOwner(server, agency);
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "subscriptions.setOverrides",
          { organizationId: agency.organizationId, extraSeats: 100, customPricePaise: 0, extraModules: [] },
          owner,
        ),
      ),
    ).toEqual({ status: 403, reason: "PLATFORM_ONLY" });
  });
});
