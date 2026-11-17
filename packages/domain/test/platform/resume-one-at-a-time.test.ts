// "Resume one agency at a time": every agency with a subscription is paused on its own, then the every-agency pause lifts.
// It runs on a database of its own and inside rolled-back transactions: it reads every subscription and holds the
// policy row, which other test files (the demo's reset, the pause tests) use at the same time.
import { randomUUID } from "node:crypto";
import { addDays, calendarDateIn, DomainError } from "../../src/kernel/index.js";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient, type PlatformTx } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlan,
  createPlatformServices,
  resumeOneAtATimeIn,
  setEveryoneAgentPause,
  type PlatformServices,
} from "../../src/platform/index.js";
import { startSubscription } from "../../src/subscriptions/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";

describe("resuming the AI agent one agency at a time", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let identity: TestIdentity;
  let services: PlatformServices;
  let planId: string;
  const staff = { userId: randomUUID() };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    identity = createTestIdentity();
    services = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 2,
      db,
      identity: identity.identity,
      storage: createMemoryStorage(),
      queue: createMemoryJobQueue(),
      jobs: createMemoryJobAdministration(),
      logger: createMemoryLogger(),
    });
    planId = (
      await createPlan(services, staff, {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        yearlyPricePaise: null,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000,
        modules: ["crm"],
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await services.platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await identity.close();
    await isolated.drop();
  });

  async function subscribed(): Promise<string> {
    const organizationId = await createTestOrganization(platform, "Subscriber");
    await services.platformDb.transaction((tx) =>
      startSubscription(tx, staff, {
        organizationId,
        planId,
        billingCycle: "monthly",
        trialEndsOn: null,
        paidThrough: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 365),
      }),
    );
    return organizationId;
  }

  /** Runs `work` in a platform transaction and rolls it back. */
  async function rolledBack(work: (tx: PlatformTx) => Promise<void>) {
    const rollback = new Error("roll back");
    await expect(
      services.platformDb.transaction(async (tx) => {
        await work(tx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  }

  it("pauses each agency on its own and lifts the every-agency pause; a repeat is refused and writes nothing", async () => {
    const first = await subscribed();
    const second = await subscribed();
    // An organization with no subscription has no agent to pause: it is skipped, not a failure.
    await createTestOrganization(platform, "No subscription");
    const adminA = { userId: randomUUID() };
    const adminB = { userId: randomUUID() };
    await rolledBack(async (tx) => {
      await setEveryoneAgentPause(tx, adminA, true, new Date("2026-11-10T05:00:00Z"));
      const alone = new Date("2026-11-11T05:00:00Z");
      await tx.subscription.update({
        where: { organizationId: first },
        data: { aiAgentPausedAt: alone, aiAgentPausedBy: adminA.userId },
      });
      const result = await resumeOneAtATimeIn(tx, adminB, new Date("2026-11-13T05:00:00Z"));
      expect(result).toEqual({ paused: 1 });
      const kept = await tx.subscription.findUniqueOrThrow({ where: { organizationId: first } });
      expect(kept).toMatchObject({ aiAgentPausedAt: alone, aiAgentPausedBy: adminA.userId });
      expect(await tx.subscription.findUniqueOrThrow({ where: { organizationId: second } })).toMatchObject({
        aiAgentPausedBy: adminB.userId,
      });
      expect(await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
        aiAgentPausedAt: null,
      });
      // The agency's own log names the platform as the source of the new pause.
      expect(
        await tx.auditEntry.findFirst({ where: { organizationId: second, action: "ai-agent.paused" } }),
      ).toMatchObject({ source: "platform", actorUserId: adminB.userId });
      expect(await tx.platformAuditEntry.count({ where: { action: "ai-agent.paused" } })).toBe(1);
      expect(await tx.platformAuditEntry.count({ where: { action: "ai-agent.resumed-everyone" } })).toBe(1);

      const entries = await tx.platformAuditEntry.count({ where: { action: { startsWith: "ai-agent." } } });
      await expect(resumeOneAtATimeIn(tx, adminB)).rejects.toSatisfy(
        (error) => error instanceof DomainError && error.reason === "AGENT_NOT_PAUSED_FOR_EVERYONE",
      );
      expect(await tx.platformAuditEntry.count({ where: { action: { startsWith: "ai-agent." } } })).toBe(entries);
    });
  });

  it("skips an agency whose subscription goes away while the action runs", async () => {
    const present = await subscribed();
    const admin = { userId: randomUUID() };
    await rolledBack(async (tx) => {
      await setEveryoneAgentPause(tx, admin, true);
      // The list of subscriptions holds one that is purged before its turn (the demo's nightly reset does this).
      const gone = randomUUID();
      const findMany = tx.subscription.findMany.bind(tx.subscription);
      const listWithGhost = async (...args: Parameters<typeof findMany>) => [
        { organizationId: gone },
        ...(await findMany(...args)),
      ];
      const racingSubscription = new Proxy(tx.subscription, {
        get: (inner, name): unknown => (name === "findMany" ? listWithGhost : (Reflect.get(inner, name) as unknown)),
      });
      const racing = new Proxy(tx, {
        get: (target, name): unknown =>
          name === "subscription" ? racingSubscription : (Reflect.get(target, name) as unknown),
      });
      const result = await resumeOneAtATimeIn(racing, admin);
      // Every real subscription of this database was paused (earlier tests' agencies too); the vanished one was skipped.
      expect(result).toEqual({ paused: await tx.subscription.count() });
      expect(await tx.subscription.findUniqueOrThrow({ where: { organizationId: present } })).toMatchObject({
        aiAgentPausedBy: admin.userId,
      });
    });
  });

  it("is refused while the every-agency pause is off, and writes nothing", async () => {
    await rolledBack(async (tx) => {
      const before = await tx.platformAuditEntry.count({ where: { action: { startsWith: "ai-agent." } } });
      await expect(resumeOneAtATimeIn(tx, { userId: randomUUID() })).rejects.toSatisfy(
        (error) => error instanceof DomainError && error.reason === "AGENT_NOT_PAUSED_FOR_EVERYONE",
      );
      expect(await tx.platformAuditEntry.count({ where: { action: { startsWith: "ai-agent." } } })).toBe(before);
    });
  });
});
