// The platform module's services on the test database, for its tests: the platform role's transactions, identity,
// and in-memory storage and job queue; and a plan to subscribe organizations to.
import { randomUUID } from "node:crypto";
import type { OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createDatabase } from "@travel-crm/db";
import {
  createMemoryJobAdministration,
  createMemoryJobQueue,
  type MemoryJobAdministration,
  type MemoryJobQueue,
} from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import { createPlan, createPlatformServices, type PlatformServices } from "../../src/platform/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";

export const supportUserId = "0199e7a0-0000-7000-8000-00000000c0de";
export const support = { userId: supportUserId };

export interface TestPlatform {
  services: PlatformServices;
  storage: MemoryStorage;
  queue: MemoryJobQueue;
  jobs: MemoryJobAdministration;
  identity: TestIdentity;
  close(): Promise<void>;
}

export function createTestPlatform(): TestPlatform {
  const urls = inject("dbUrls");
  const identity = createTestIdentity();
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const storage = createMemoryStorage();
  const queue = createMemoryJobQueue();
  const jobs = createMemoryJobAdministration();
  const services = createPlatformServices({
    platformDatabaseUrl: urls.platform,
    maxConnections: 2,
    db,
    identity: identity.identity,
    storage,
    queue,
    jobs,
  });
  return {
    services,
    storage,
    queue,
    jobs,
    identity,
    close: async () => {
      await services.platformDb.disconnect();
      await db.disconnect();
      await identity.close();
    },
  };
}

export function createTestPlan(test: TestPlatform): Promise<PlanSummary> {
  return createPlan(test.services, support, {
    key: `plan-${randomUUID().slice(0, 8)}`,
    name: "Starter",
    monthlyPricePaise: 250_000,
    yearlyPricePaise: null,
    seatLimit: 5,
    whatsappNumberLimit: 1,
    storageLimitBytes: 5_000_000_000,
    modules: ["crm"],
  });
}

/** What the platform team enters for a new agency, with a unique code and owner address, on a month's trial. */
export function onboardingInput(plan: PlanSummary): OnboardOrganizationInput {
  const code = `S${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
  return {
    name: "Sharma Holidays",
    code,
    timeZone: "Asia/Kolkata",
    contactEmail: `hello-${code.toLowerCase()}@example.test`,
    profile: {
      legalName: "Sharma Holidays Private Limited",
      gstin: null,
      gstStateCode: "27",
      contactName: "Asha Sharma",
      contactPhone: "+919876543210",
    },
    owner: { name: "Asha Sharma", email: `asha-${code.toLowerCase()}@example.test` },
    subscription: {
      planId: plan.id,
      billingCycle: "monthly",
      trialEndsOn: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30),
      paidThrough: null,
    },
  };
}
