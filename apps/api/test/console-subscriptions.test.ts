// The console's work on an organization's subscription (spec 7.2-7.4): platform staff change its plan and overrides,
// record payments and suspend or cancel it by hand, and the organization's own audit log shows each change under the
// platform admin's name. Organization staff reach none of it.
import type { PlanSummary, SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
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
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's subscriptions", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let starter: PlanSummary;
  let growth: PlanSummary;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    const plan = (name: string, modules: PlanSummary["modules"]) =>
      createPlan(
        testConsole.services,
        { userId: support.userId },
        {
          key: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
          name,
          monthlyPricePaise: 250_000,
          yearlyPricePaise: null,
          seatLimit: 5,
          whatsappNumberLimit: 1,
          storageLimitBytes: 5_000_000_000,
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

  async function subscribedAgency(): Promise<TestAgency> {
    const agency = await createTestAgency(server);
    await testConsole.services.platformDb.transaction((tx) =>
      startSubscription(
        tx,
        { userId: support.userId },
        {
          organizationId: agency.organizationId,
          planId: starter.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: "2099-12-31",
        },
      ),
    );
    return agency;
  }

  it("changes the plan and overrides, recorded in the organization's log under the admin's name", async () => {
    const agency = await subscribedAgency();
    const { organizationId } = agency;
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.changePlan",
        { organizationId, planId: growth.id, billingCycle: "yearly" },
        support.jar,
      ),
    );
    const overridden = await dataOf<SubscriptionDetails>(
      await consoleMutate(
        testConsole,
        "subscriptions.setOverrides",
        { organizationId, extraSeats: 2, customPricePaise: 0, extraModules: ["accounts"] },
        support.jar,
      ),
    );
    expect(overridden).toMatchObject({
      plan: { id: growth.id },
      billingCycle: "yearly",
      extraSeats: 2,
      extraModules: ["accounts"],
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

  it("records a payment, suspends and cancels by hand, and shows the subscription with its payments", async () => {
    const { organizationId } = await subscribedAgency();
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.suspend",
        { organizationId, reason: "Unpaid since August" },
        support.jar,
      ),
    );
    const payment = await dataOf<{ id: string }>(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        {
          organizationId,
          amountPaise: 250_000,
          paidOn: "2026-10-16",
          paidThrough: "2099-12-31",
          reference: "UPI 6123",
        },
        support.jar,
      ),
    );
    const shown = await dataOf<SubscriptionWithPayments>(
      await consoleQuery(testConsole, "subscriptions.get", support.jar, { organizationId }),
    );
    expect(shown.subscription.status).toBe("active");
    expect(shown.payments.map((listed) => listed.id)).toEqual([payment.id]);
    expect(
      await dataOf(
        await consoleMutate(
          testConsole,
          "subscriptions.cancel",
          { organizationId, reason: "Closing down" },
          support.jar,
        ),
      ),
    ).toMatchObject({ status: "cancelled" });
  });

  it("says when an organization has no subscription, and refuses a reason left blank", async () => {
    const unsubscribed = await createTestAgency(server);
    expect(
      await refusalOf(
        await consoleQuery(testConsole, "subscriptions.get", support.jar, {
          organizationId: unsubscribed.organizationId,
        }),
      ),
    ).toEqual({ status: 404, reason: "SUBSCRIPTION_NOT_FOUND" });
    expect(
      (
        await consoleMutate(
          testConsole,
          "subscriptions.suspend",
          { organizationId: unsubscribed.organizationId, reason: "" },
          support.jar,
        )
      ).status,
    ).toBe(400);
  });

  it("is out of reach of an organization's own staff", async () => {
    const agency = await subscribedAgency();
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
