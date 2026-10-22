// What the website form's and consent routers' tests need: an agency on a real database and subscription, a member of it as
// the test sets up, and a caller of the app router on stand-in identity, profile and file services.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { PermissionSet, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { createPlan, createSubscriptionAccess, demoPlan, startSubscription } from "@travel-crm/domain/subscriptions";
import { inject } from "vitest";
import type { Context } from "../src/context.js";
import { appRouter } from "../src/routers/app-router.js";
import { t } from "../src/trpc.js";

export const clock = { now: new Date("2026-10-22T06:00:00Z") };

export interface Harness {
  db: Database;
  platformDb: PlatformDatabase;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createHarness(): Harness {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
  const platform = createPlatformClient(urls.platform);
  return {
    db,
    platformDb,
    platform,
    close: async () => {
      await db.disconnect();
      await platformDb.disconnect();
      await platform.$disconnect();
    },
  };
}

/** An agency subscribed on a plan with crm (or the demo's plan), paid through the end of October 2026. */
export async function anAgency(harness: Harness, options: { demo?: boolean } = {}): Promise<string> {
  const organizationId = await createTestOrganization(harness.platform, "Asha Travels");
  await harness.platformDb.transaction(async (tx) => {
    const plan = options.demo
      ? await demoPlan(tx)
      : await createPlan(tx, {
          key: `plan-${randomUUID().slice(0, 8)}`,
          name: "Starter",
          monthlyPricePaise: 250_000,
          yearlyPricePaise: null,
          extraSeatMonthlyPricePaise: null,
          extraSeatYearlyPricePaise: null,
          seatLimit: 5,
          whatsappNumberLimit: 1,
          storageLimitBytes: 5_000_000_000,
          modules: ["crm"],
        });
    await startSubscription(
      tx,
      options.demo ? { userId: null } : { userId: randomUUID() },
      { organizationId, planId: plan.id, billingCycle: "monthly", trialEndsOn: null, paidThrough: "2026-10-31" },
      clock.now,
    );
  });
  return organizationId;
}

export interface CallerOptions {
  organizationId: string;
  owner?: string | null;
  /** The permissions the member holds, all records; every one when left out. */
  granted?: Permission[];
  now?: Date;
}

export function memberOf(organizationId: string, granted?: Permission[]): MemberAccess {
  return {
    organizationId,
    userId: randomUUID(),
    memberId: randomUUID(),
    source: "web",
    impersonatedBy: null,
    role: { key: "custom", name: "Custom", isOwner: granted === undefined },
    permissions:
      granted === undefined
        ? PermissionSet.everything()
        : PermissionSet.of(granted.map((permission) => ({ permission, scope: "all" as const }))),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
}

export function callerOf(
  harness: Harness,
  options: CallerOptions,
  member = memberOf(options.organizationId, options.granted),
) {
  const owner = options.owner === undefined ? randomUUID() : options.owner;
  const identity = {
    resolveAccess: () => Promise.resolve(member),
    recordActivity: () => Promise.resolve(),
    firstOwner: () => Promise.resolve(owner),
    organizationProfile: () =>
      Promise.resolve({
        id: options.organizationId,
        name: "Asha Travels",
        code: "ASHA",
        timeZone: "Asia/Kolkata",
        contactEmail: null,
      }),
    memberContacts: (_organization: string, ids: readonly string[]) =>
      Promise.resolve(ids.map((userId) => ({ userId, name: "Asha Rao", email: null }))),
    leadWorkers: () => Promise.resolve(owner === null ? [] : [{ userId: owner, name: "Asha Rao" }]),
  } as unknown as Identity;
  const context = {
    identity,
    subscriptions: createSubscriptionAccess({ db: harness.db, now: () => options.now ?? clock.now }),
    profiles: { get: () => Promise.resolve(null) },
    db: harness.db,
    files: { list: () => Promise.resolve([]), systemDownloadLink: () => Promise.reject(new Error("no logo")) },
    appUrl: "https://app.example.test",
    headers: new Headers(),
    resHeaders: new Headers(),
    session: { activeOrganizationId: options.organizationId, impersonatedBy: null },
    user: { id: member.userId },
  } as unknown as Context;
  return { caller: t.createCallerFactory(appRouter)(context), member, owner };
}

/** The reason a call is refused with, or its error code. */
export async function refusal(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "accepted";
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
}
