// Platform staff can pause the WhatsApp agent for every agency or for one: while paused it writes nothing to a customer
// and queues nothing, every follow-up it owes stays due, and it picks up again after the resume.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
  type PlatformTx,
} from "@travel-crm/db/platform";
import {
  aiChatResumedListener,
  aiCustomerWroteListener,
  runAgentTurn,
  runAiNudges,
  saveAiSettings,
  saveAutopilot,
} from "../../src/ai/index.js";
import { systemActor, parseCalendarDate } from "../../src/kernel/index.js";
import { agentPauseOf, type Entitlements } from "../../src/subscriptions/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";
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
const reply = JSON.stringify({
  reply: "Manali 5N/6D is Rs 18,500 per person. How many are travelling?",
  handoff: false,
  handoffReason: "",
  attention: "",
  memory: "",
  followUp: { needed: false, inHours: 0, why: "" },
});
const turnAt = new Date(testNow.getTime() + 60_000);
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

  /** An agency whose customer has written, with the AI and the autopilot on. */
  async function agency() {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: freshPhone().replace("+", ""),
        customerName: "Rahul",
        text: "Manali for 4?",
      }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), stage: "contacted" }),
    );
    await inOrg((tx) =>
      saveAiSettings(
        tx,
        owner,
        { enabled: true, scoring: true, instructions: "" },
        { providerReady: true, now: testNow },
      ),
    );
    await inOrg((tx) =>
      saveAutopilot(
        tx,
        owner,
        {
          autopilot: true,
          grounded: false,
          agentName: "Riya",
          followUpHours: 4,
          maxRepliesPerDay: 25,
          language: "customer",
          languageOther: "",
          style: "human",
          emojis: "few",
          tone: "friendly",
          handoff: "alert",
          smartFollowUp: true,
          learning: false,
          persona: "sales",
          leadNotes: true,
          sendMedia: true,
          paymentDetails: "",
          strictRules: "",
          followUpTasks: true,
        },
        parseCalendarDate("2026-11-10"),
      ),
    );
    const model = createMemoryAiModel();
    const dependencies = {
      db: test.db,
      ai: model,
      subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
      agencyName: () => Promise.resolve("Sharma Holidays"),
      files: test.files,
      managers: () => Promise.resolve([]),
      logger: test.logger,
    };
    const turn = () =>
      runAgentTurn(dependencies, { organizationId, conversationId: chat.id, kind: "reply", token: message.id }, turnAt);
    const context: ListenerContext = { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) };
    return { organizationId, inOrg, chat, message, lead, model, dependencies, turn, context };
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
    on.model.answer(reply);
    expect(await on.turn()).toBe("paused");
    expect(await outbound(on)).toBe(0);
    await pauseAgency(on.organizationId, false);
    on.model.answer(reply);
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

  it("a follow-up due while paused stays due, and is worked after resume", async () => {
    const on = await agency();
    const dueAt = new Date(turnAt.getTime() - hour);
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
    const followUpAt = () => on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    await subscribe(on.organizationId, true);
    await runAiNudges(on.dependencies, turnAt);
    expect((await followUpAt()).followUpAt).toEqual(dueAt);
    await pauseAgency(on.organizationId, false);
    on.model.answer(reply);
    await runAiNudges(on.dependencies, turnAt);
    expect((await followUpAt()).followUpAt).toBeNull();
  });

  it("a lead follow-up task due while paused is not claimed", async () => {
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
    expect(await on.inOrg((tx) => tx.aiFollowUpTouch.count())).toBe(0);
    await pauseAgency(on.organizationId, false);
    on.model.answer(reply);
    await runAiNudges(on.dependencies, turnAt);
    expect(await on.inOrg((tx) => tx.aiFollowUpTouch.count())).toBe(1);
  });

  // "Pausing every agency stops an unpaused one" has no end-to-end test: every gate calls agentPauseOf (tested above
  // inside a rolled-back transaction), and the per-agency tests drive each gate end to end.
});
