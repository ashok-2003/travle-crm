// Platform staff pause the WhatsApp agent for every agency or for one: the pause is stored once, logged once, and a
// repeat changes and logs nothing. The every-agency pause is only ever made inside a platform transaction that is
// rolled back, because other test files read the same row.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient, type PlatformTx } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import {
  listPlatformLog,
  onboardOrganization,
  organizationAgentPause,
  pauseOrganization,
  setEveryoneAgentPause,
} from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("pausing the WhatsApp agent from the console", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  /** Runs `work` in a platform transaction and rolls it back. */
  async function rolledBack(work: (tx: PlatformTx) => Promise<void>) {
    const rollback = new Error("roll back");
    await expect(
      test.services.platformDb.transaction(async (tx) => {
        await work(tx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  }

  const everyoneEntries = (tx: PlatformTx) =>
    tx.platformAuditEntry.findMany({
      where: { targetType: "platform", action: { startsWith: "ai-agent." } },
      orderBy: { id: "asc" },
    });

  it("pausing every agency sets the policy's pause and logs it once; pausing again changes nothing and logs nothing", async () => {
    const admin = { userId: randomUUID() };
    await rolledBack(async (tx) => {
      const before = (await everyoneEntries(tx)).length;
      await setEveryoneAgentPause(tx, admin, true);
      expect(await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
        aiAgentPausedBy: admin.userId,
      });
      const [entry] = (await everyoneEntries(tx)).slice(before);
      expect(entry).toMatchObject({ action: "ai-agent.paused-everyone", actorUserId: admin.userId });
      await setEveryoneAgentPause(tx, admin, true);
      expect((await everyoneEntries(tx)).length).toBe(before + 1);
    });
  });

  it("resuming every agency clears it and logs ai-agent.resumed-everyone", async () => {
    const admin = { userId: randomUUID() };
    await rolledBack(async (tx) => {
      const before = (await everyoneEntries(tx)).length;
      await setEveryoneAgentPause(tx, admin, true);
      await setEveryoneAgentPause(tx, admin, false);
      expect(await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
        aiAgentPausedAt: null,
        aiAgentPausedBy: null,
      });
      const actions = (await everyoneEntries(tx)).slice(before).map((entry) => entry.action);
      expect(actions).toEqual(["ai-agent.paused-everyone", "ai-agent.resumed-everyone"]);
      // Resuming what is not paused logs nothing.
      await setEveryoneAgentPause(tx, admin, false);
      expect((await everyoneEntries(tx)).length).toBe(before + 2);
    });
  });

  it("pausing one agency sets its subscription's pause and logs it in its own log and the platform's; resuming logs too", async () => {
    const plan = await createTestPlan(test);
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const admin = { userId: randomUUID() };
    const paused = await pauseOrganization(test.services, admin, { organizationId, paused: true });
    expect(paused.agency).not.toBeNull();
    const stored = await platform.subscription.findUniqueOrThrow({ where: { organizationId } });
    expect(stored.aiAgentPausedBy).toBe(admin.userId);
    expect(paused.agency?.since).toBe(stored.aiAgentPausedAt?.toISOString());
    expect(await organizationAgentPause(test.services, organizationId)).toMatchObject({ agency: paused.agency });

    // Pausing again changes nothing and logs nothing.
    await pauseOrganization(test.services, admin, { organizationId, paused: true });
    const resumed = await pauseOrganization(test.services, admin, { organizationId, paused: false });
    expect(resumed.agency).toBeNull();
    await pauseOrganization(test.services, admin, { organizationId, paused: false });

    const own = await platform.auditEntry.findMany({
      where: { organizationId, action: { startsWith: "ai-agent." } },
      orderBy: { id: "asc" },
    });
    expect(own).toMatchObject([
      { action: "ai-agent.paused", source: "platform", actorUserId: admin.userId, entityType: "subscription" },
      { action: "ai-agent.resumed", source: "platform", actorUserId: admin.userId },
    ]);
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    expect(page.entries.filter((entry) => entry.action.startsWith("ai-agent.")).map((entry) => entry.action)).toEqual([
      "ai-agent.resumed",
      "ai-agent.paused",
    ]);
  });

  it("an organization without a subscription can't be paused alone", async () => {
    const organizationId = await createTestOrganization(platform, "No subscription");
    await expect(
      pauseOrganization(test.services, { userId: randomUUID() }, { organizationId, paused: true }),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.code === "NOT_FOUND");
  });
});
