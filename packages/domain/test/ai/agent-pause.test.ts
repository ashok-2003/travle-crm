// Platform staff can pause the WhatsApp agent for every agency or for one: while paused it writes nothing to a customer
// and queues nothing, a follow-up that comes due meanwhile is let go, and it answers again from the next customer message after the resume.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
  type PlatformTx,
} from "@travel-crm/db/platform";
import { aiChatResumedListener, aiCustomerWroteListener, runAiNudges } from "../../src/ai/index.js";
import { liteAgency, liteTurnAt } from "./lite/support/lite-agency.js";
import { greeting, understood, written } from "./lite/support/turn-script.js";
import { systemActor } from "../../src/kernel/index.js";
import { agentPauseOf, type Entitlements } from "../../src/subscriptions/index.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import type { ListenerContext } from "../../src/jobs/index.js";

const entitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};
const withoutAi: Entitlements = { ...entitlements, modules: new Set(["crm", "inbox"]) };
const scriptReply = (on: { model: { answer: (...answers: string[]) => void } }) => {
  on.model.answer(understood([["hello", "Hi"]]), written(greeting));
};
const turnAt = liteTurnAt;
const hour = 3_600_000;

describe("the agent while paused", () => {
  let test: TestInbox;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platform = createPlatformClient(inject("dbUrls").platform);
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await test.close();
  });

  /** Pauses every agency inside one platform transaction that is rolled back: other test files read the same row. */
  async function inRolledBackEveryonePause(work: (tx: PlatformTx) => Promise<void>) {
    const rollback = new Error("roll back");
    await expect(
      platformDb.transaction(async (tx) => {
        await tx.subscriptionPolicy.update({
          where: { id: true },
          data: { aiAgentPausedAt: new Date(), aiAgentPausedBy: randomUUID() },
        });
        await work(tx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  }

  /** The agency has a subscription row (it needs a plan), paused or not. */
  async function subscribe(organizationId: string, paused: boolean) {
    const plan = await platform.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm", "inbox", "ai"],
      },
    });
    await platform.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: testNow,
        trialEndsOn: new Date("2099-01-01"),
        ...(paused ? { aiAgentPausedAt: new Date(), aiAgentPausedBy: randomUUID() } : {}),
      },
    });
  }
  const pauseAgency = (organizationId: string, paused: boolean) =>
    platform.subscription.update({
      where: { organizationId },
      data: paused
        ? { aiAgentPausedAt: new Date(), aiAgentPausedBy: randomUUID() }
        : { aiAgentPausedAt: null, aiAgentPausedBy: null },
    });

  /** An agency whose customer has written, with the AI and the autopilot on and its setup ready. */
  async function agency() {
    const made = await liteAgency(test);
    const { organizationId, inOrg, chat, message, model } = made;
    const dependencies = {
      db: test.db,
      identity: made.identity,
      ai: model,
      // The sweeps visit every agency in the shared database: only this one has the AI.
      subscriptions: {
        entitlementsOf: (id: string) => Promise.resolve(id === organizationId ? entitlements : withoutAi),
      },
      agencyName: () => Promise.resolve("Sharma Holidays"),
      files: test.files,
      managers: () => Promise.resolve([]),
      logger: test.logger,
    };
    const turn = () => made.turn();
    const context: ListenerContext = { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) };
    return { organizationId, inOrg, chat, message, lead: { id: made.leadId }, model, dependencies, turn, context };
  }

  const outbound = (on: Awaited<ReturnType<typeof agency>>) =>
    on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }));

  it("agentPauseOf: running, paused for the agency, paused for everyone, both (everyone wins), no subscription row", async () => {
    const on = await agency();
    const bare = await agency();
    const read = (who: { organizationId: string; inOrg: typeof on.inOrg }) =>
      who.inOrg((tx) => agentPauseOf(tx, who.organizationId));
    expect(await read(on)).toBeNull();
    await subscribe(on.organizationId, false);
    expect(await read(on)).toBeNull();
    await pauseAgency(on.organizationId, true);
    expect(await read(on)).toMatchObject({ scope: "agency" });
    // Both set: everyone wins. With no subscription row, only the every-agency pause counts, and nothing throws.
    await inRolledBackEveryonePause(async (tx) => {
      expect(await agentPauseOf(tx, on.organizationId)).toMatchObject({ scope: "everyone" });
      expect(await agentPauseOf(tx, bare.organizationId)).toMatchObject({ scope: "everyone" });
    });
    expect(await read(on)).toMatchObject({ scope: "agency" });
    expect(await read(bare)).toBeNull();
  });

  it("a customer's message to a paused agency queues no turn and marks nothing", async () => {
    const on = await agency();
    await subscribe(on.organizationId, true);
    const before = test.queue.sent.length;
    await aiCustomerWroteListener({ queue: test.queue, subscriptions: on.dependencies.subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: on.chat.id, messageId: on.message.id, firstEver: false },
        occurredAt: testNow,
      },
      on.context,
    );
    expect(test.queue.sent.length).toBe(before);
    expect(await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }))).toBeNull();
  });

  it("a turn already queued before the pause sends nothing", async () => {
    const on = await agency();
    await subscribe(on.organizationId, true);
    scriptReply(on);
    expect(await on.turn()).toBe("paused");
    expect(await outbound(on)).toBe(0);
    await pauseAgency(on.organizationId, false);
    scriptReply(on);
    expect(await on.turn()).not.toBe("paused");
  });

  it("a chat given back to the AI while paused queues nothing", async () => {
    const on = await agency();
    await subscribe(on.organizationId, true);
    const before = test.queue.sent.length;
    await aiChatResumedListener({ queue: test.queue, subscriptions: on.dependencies.subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "ai.chat-resumed",
        payload: { conversationId: on.chat.id },
        occurredAt: testNow,
      },
      on.context,
    );
    expect(test.queue.sent.length).toBe(before);
  });

  it("a follow-up due while paused is let go, and nothing fires after resume", async () => {
    const on = await agency();
    const dueAt = new Date(turnAt.getTime() - hour);
    const laterAt = new Date(turnAt.getTime() + hour);
    await on.inOrg(async (tx) => {
      await tx.whatsappConversation.updateMany({
        data: { lastInboundAt: new Date(turnAt.getTime() - 2 * hour), needsReply: false },
      });
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, mode: "on", followUpAt: dueAt },
        update: { mode: "on", followUpAt: dueAt, handedOffAt: null },
      });
    });
    const state = () => on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    await subscribe(on.organizationId, true);
    await runAiNudges(on.dependencies, turnAt);
    expect((await state()).followUpAt).toBeNull();
    expect(await outbound(on)).toBe(0);
    // A follow-up planned for later is kept.
    await on.inOrg((tx) =>
      tx.aiChat.updateMany({ where: { conversationId: on.chat.id }, data: { followUpAt: laterAt } }),
    );
    await runAiNudges(on.dependencies, turnAt);
    expect((await state()).followUpAt).toEqual(laterAt);
    await on.inOrg((tx) => tx.aiChat.updateMany({ where: { conversationId: on.chat.id }, data: { followUpAt: null } }));
    await pauseAgency(on.organizationId, false);
    scriptReply(on);
    await runAiNudges(on.dependencies, turnAt);
    expect(await outbound(on)).toBe(0);
  });

  it("a lead follow-up task due while paused is the team's, and not worked after resume", async () => {
    const on = await agency();
    await on.inOrg((tx) =>
      tx.task.create({
        data: {
          kind: "follow-up",
          title: "Call about Manali",
          dueAt: new Date(turnAt.getTime() - hour),
          firstDueAt: new Date(turnAt.getTime() - hour),
          recordType: "lead",
          recordId: on.lead.id,
        },
      }),
    );
    await subscribe(on.organizationId, true);
    await runAiNudges(on.dependencies, turnAt);
    const touches = () => on.inOrg((tx) => tx.aiFollowUpTouch.findMany({ select: { outcome: true } }));
    expect(await touches()).toEqual([]);
    expect(await outbound(on)).toBe(0);
    await pauseAgency(on.organizationId, false);
    scriptReply(on);
    await runAiNudges(on.dependencies, turnAt);
    expect(await touches()).toEqual([]);
    expect(await outbound(on)).toBe(0);
    expect(await on.inOrg((tx) => tx.task.count({ where: { doneAt: null, cancelledAt: null } }))).toBe(1);
  });

  // "Pausing every agency stops an unpaused one" has no end-to-end test: every gate calls agentPauseOf (tested above
  // inside a rolled-back transaction), and the per-agency tests drive each gate end to end.
});
