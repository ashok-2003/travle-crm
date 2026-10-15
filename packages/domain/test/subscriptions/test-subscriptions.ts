// Plans and subscribed organizations for the subscriptions module's tests, made through the module itself in platform
// transactions, as the console makes them.
import { randomUUID } from "node:crypto";
import type { CreatePlanInput, PlanSummary, StartSubscriptionInput } from "@travel-crm/contracts/subscriptions";
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import { createPlan, startSubscription } from "../../src/subscriptions/index.js";
import { backendPid } from "../lock-waits.js";

export const adminUserId = "0199e7a0-0000-7000-8000-00000000ad01";
export const byAdmin = { userId: adminUserId };

/** The tests' clock, 11:30 on 16 October 2026 in India: every date in these tests is relative to it, not to today. */
export const testNow = new Date("2026-10-16T06:00:00Z");

export interface TestSubscriptions {
  platformDb: PlatformDatabase;
  db: Database;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createTestSubscriptions(): TestSubscriptions {
  const urls = inject("dbUrls");
  const platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const platform = createPlatformClient(urls.platform);
  return {
    platformDb,
    db,
    platform,
    close: async () => {
      await platformDb.disconnect();
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

export async function createTestPlan(
  test: TestSubscriptions,
  fields: Partial<CreatePlanInput> = {},
): Promise<PlanSummary> {
  return test.platformDb.transaction((tx) =>
    createPlan(tx, {
      key: `plan-${randomUUID().slice(0, 8)}`,
      name: "Starter",
      monthlyPricePaise: 250_000,
      annualPricePaise: 2_500_000,
      includedSeats: 5,
      extraSeatMonthlyPricePaise: 50_000,
      extraSeatAnnualPricePaise: 500_000,
      whatsappNumberLimit: 1,
      storageGb: 5,
      modules: ["crm", "quotes"],
      ...fields,
    }),
  );
}

/**
 * An organization (in Asia/Kolkata unless told otherwise) subscribed to plan as start says, at `now` (the tests'
 * clock unless given): by default active and paid through a year after the tests' clock.
 */
export async function createSubscribedOrganization(
  test: TestSubscriptions,
  plan: PlanSummary,
  start: Partial<StartSubscriptionInput> = {},
  options: { timeZone?: string; now?: Date } = {},
): Promise<string> {
  const organizationId = await createTestOrganization(test.platform, "Subscriber");
  if (options.timeZone) {
    await test.platform.organization.update({ where: { id: organizationId }, data: { timeZone: options.timeZone } });
  }
  await test.platformDb.transaction((tx) =>
    startSubscription(
      tx,
      byAdmin,
      {
        organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        trialEndsOn: null,
        paidThrough: "2027-10-15",
        ...start,
      },
      options.now ?? testNow,
    ),
  );
  return organizationId;
}

/** The organization's audit entries about its subscription, oldest first. */
export async function subscriptionEntries(test: TestSubscriptions, organizationId: string) {
  return test.db.forOrg(organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { entityType: "subscription" }, orderBy: { id: "asc" } }),
  );
}

/**
 * A transaction held open where it calls pause(tx), until release(): `pid` is its backend process, for
 * waitUntilBlockedBy. For tests that race two transactions through the real code.
 */
export function holdOpen() {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let holding: (pid: number) => void = () => undefined;
  const pid = new Promise<number>((resolve) => {
    holding = resolve;
  });
  return {
    pid,
    release: () => {
      release();
    },
    pause: async (tx: Parameters<typeof backendPid>[0]) => {
      holding(await backendPid(tx));
      await released;
    },
  };
}
