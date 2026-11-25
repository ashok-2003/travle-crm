// A turn whose model fails is sent again after two minutes, then after ten; the third failure sends the customer
// nothing (the owner, 2026-11-24: no automatic holding line) and leaves the team a task, and the AI stays on. An old
// attempt ends quietly when the customer wrote since, and five chats run at once.
import { randomUUID } from "node:crypto";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { aiChatResumedListener, aiReplyHandler, type AgentDependencies } from "../../src/ai/index.js";
import { replyDayOf } from "../../src/ai/may-write.js";
import { uuidFromKey } from "../../src/jobs/index.js";
import { createTestInbox, type TestInbox } from "../inbox/support.js";
import { FIRST_LINE, liveAgency, liveAt, liveNow, type LiveAgency } from "./natural/support/live-agency.js";

const FAILED = { ok: false, reason: "unavailable" } as const;

describe("a failed turn is tried again, then left to the team", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  afterEach(() => vi.useRealTimers());

  const handlerOf = (on: LiveAgency) => {
    const dependencies: AgentDependencies & { logger: typeof test.logger; queue: typeof test.queue } = {
      ...on.dependencies(),
      logger: test.logger,
      queue: test.queue,
      toolAgent: createMemoryToolAgent(),
    };
    return aiReplyHandler(dependencies);
  };
  const jobOf = (on: LiveAgency, messageId: string, attempt?: number) => ({
    organizationId: on.organizationId,
    conversationId: on.chat.id,
    messageId,
    ...(attempt === undefined ? {} : { attempt }),
  });
  /** The jobs this test queued on ai.reply since `from`. */
  const retries = (from: number) => test.queue.sent.slice(from).filter((job) => job.queue === "ai.reply");
  const outbound = (on: LiveAgency) =>
    on.inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: on.chat.id, direction: "out" },
        select: { body: true },
      }),
    );
  const clockAt = (at: Date) => vi.useFakeTimers({ now: at, toFake: ["Date"] });

  it("sends the job again after two minutes, then ten, when the model fails", async () => {
    const on = await liveAgency(test);
    const handler = handlerOf(on);
    const from = test.queue.sent.length;
    clockAt(liveNow);
    on.model.answer(FAILED);
    await handler.handle(jobOf(on, on.message.id));
    const [first] = retries(from);
    expect(first).toMatchObject({
      data: { ...jobOf(on, on.message.id), attempt: 1 },
      id: uuidFromKey(`${on.message.id}:1`),
    });
    expect(first?.options.startAfter?.getTime()).toBe(liveNow.getTime() + 120_000);
    expect(await outbound(on)).toEqual([]);

    on.model.answer(FAILED);
    await handler.handle(first?.data ?? {});
    const [, second] = retries(from);
    expect(second).toMatchObject({ data: { attempt: 2 }, id: uuidFromKey(`${on.message.id}:2`) });
    expect(second?.options.startAfter?.getTime()).toBe(liveNow.getTime() + 600_000);
    expect(await outbound(on)).toEqual([]);
  });

  it("sends nothing and leaves a task after the third failure, and the AI stays on", async () => {
    const on = await liveAgency(test);
    const handler = handlerOf(on);
    const from = test.queue.sent.length;
    clockAt(liveNow);
    on.model.answer(FAILED);
    await handler.handle(jobOf(on, on.message.id, 2));
    expect(retries(from)).toEqual([]);
    expect(await outbound(on)).toEqual([]);
    const tasks = await on.inOrg((tx) => tx.task.findMany({ where: { byAi: true } }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain(FIRST_LINE);
    expect(tasks[0]?.title).toContain("nothing went to the customer");
    expect(tasks[0]).toMatchObject({ recordType: "lead", recordId: on.leadId });
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(state).toMatchObject({ mode: "default", handedOffAt: null });
    // Nothing went, so the day's cap counts nothing.
    expect(state.lastReplyAt).toBeNull();
    // The model was never asked: the fallback is code's.
    expect(on.model.requests).toHaveLength(0);
  });

  it("opens a lead for the task when the chat has none", async () => {
    const on = await liveAgency(test);
    await on.inOrg((tx) => tx.lead.updateMany({ where: { id: on.leadId }, data: { stage: "won" } }));
    clockAt(liveNow);
    await handlerOf(on).handle(jobOf(on, on.message.id, 2));
    const task = await on.inOrg((tx) => tx.task.findFirstOrThrow({ where: { byAi: true } }));
    expect(task.recordId).not.toBe(on.leadId);
    expect(task.recordType).toBe("lead");
    expect(await outbound(on)).toEqual([]);
  });

  it("still hands over and leaves a task, sending nothing, when the day's cap was reached during the waits", async () => {
    const on = await liveAgency(test);
    await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const atTheCap = { repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay };
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, ...atTheCap },
        update: atTheCap,
      });
    });
    clockAt(liveNow);
    await handlerOf(on).handle(jobOf(on, on.message.id, 2));
    expect(await outbound(on)).toEqual([]);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(state.handoffReason).toBe("Wrote more than the AI answers in a day");
    const tasks = await on.inOrg((tx) => tx.task.findMany({ where: { byAi: true } }));
    expect(tasks.map((task) => [task.recordType, task.recordId])).toEqual([["lead", on.leadId]]);
  });

  it("ends an old attempt quietly when the customer wrote since", async () => {
    const on = await liveAgency(test);
    const handler = handlerOf(on);
    const from = test.queue.sent.length;
    await on.write({ direction: "in", at: liveAt(30), body: "Hello?" });
    clockAt(liveAt(60));
    await handler.handle(jobOf(on, on.message.id, 2));
    expect(await outbound(on)).toEqual([]);
    expect(await on.inOrg((tx) => tx.task.count({ where: { byAi: true } }))).toBe(0);
    expect(retries(from)).toEqual([]);
    expect(on.model.requests).toHaveLength(0);
  });

  it("answers the newest message that was not deleted for everyone", async () => {
    const on = await liveAgency(test);
    await on.write({ direction: "in", at: liveAt(30), body: "Never mind" });
    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({ where: { body: "Never mind" }, data: { revokedAt: liveAt(40) } }),
    );
    clockAt(liveAt(60));
    // The first line is the newest one that stands, so the job is not ended as an old one: a turn runs and is logged.
    const before = test.logger.entries.length;
    await handlerOf(on).handle(jobOf(on, on.message.id, 2));
    expect(test.logger.entries.slice(before).map((entry) => entry.msg)).toContain("The AI agent's turn");
  });

  it("queues a chat given back to the AI on the newest message that was not deleted", async () => {
    const on = await liveAgency(test);
    await on.write({ direction: "in", at: liveAt(30), body: "Never mind" });
    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({ where: { body: "Never mind" }, data: { revokedAt: liveAt(40) } }),
    );
    const from = test.queue.sent.length;
    await aiChatResumedListener({ queue: test.queue, subscriptions: on.dependencies().subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "ai.chat-resumed",
        payload: { conversationId: on.chat.id },
        occurredAt: liveAt(50),
      },
      { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) },
    );
    expect(retries(from).map((job) => (job.data as { messageId: string }).messageId)).toEqual([on.message.id]);
  });

  it("runs five chats at once", () => {
    expect(handlerOf({ dependencies: () => ({}) } as unknown as LiveAgency).concurrency).toBe(5);
  });
});
