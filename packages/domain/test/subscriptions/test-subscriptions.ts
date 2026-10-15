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

export const adminUserId = "0199e7a0-0000-7000-8000-00000000ad01";
export const byAdmin = { userId: adminUserId };

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
      yearlyPricePaise: 2_500_000,
      seatLimit: 5,
      whatsappNumberLimit: 1,
      storageLimitBytes: 5_000_000_000,
      modules: ["crm", "quotes"],
      ...fields,
    }),
  );
}

/** An organization (in Asia/Kolkata unless told otherwise) subscribed to plan as start says. */
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
        paidThrough: "2099-12-31",
        ...start,
      },
      options.now,
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
