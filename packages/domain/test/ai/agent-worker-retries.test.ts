// No silence (plan 2, Task 8): a natural turn whose model fails is sent again after a minute, then after five; the third
// failure sends the fallback line with a team task, and the AI stays on. An old attempt ends quietly when the customer
// wrote since, and five chats run at once.
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setAgent } from "../../src/ai/agent-choice.js";
import { systemActor } from "../../src/kernel/index.js";
import { aiReplyHandler, type AgentDependencies } from "../../src/ai/index.js";
import { replyDayOf } from "../../src/ai/may-write.js";
import { fallbackLine } from "../../src/ai/natural/fallback-line.js";
import { uuidFromKey } from "../../src/jobs/index.js";
import { createTestInbox, type TestInbox } from "../inbox/support.js";
import { FIRST_LINE, liveAgency, liveAt, liveNow, type LiveAgency } from "./natural/support/live-agency.js";

const FAILED = { ok: false, reason: "unavailable" } as const;

describe("a failed natural turn is tried again, never left silent", () => {
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

  it("sends the job again after a minute, then five, when the model fails", async () => {
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
    expect(first?.options.startAfter?.getTime()).toBe(liveNow.getTime() + 60_000);
    expect(await outbound(on)).toEqual([]);

    on.model.answer(FAILED);
    await handler.handle(first?.data ?? {});
    const [, second] = retries(from);
    expect(second).toMatchObject({ data: { attempt: 2 }, id: uuidFromKey(`${on.message.id}:2`) });
    expect(second?.options.startAfter?.getTime()).toBe(liveNow.getTime() + 300_000);
    expect(await outbound(on)).toEqual([]);
  });

  it("sends the fallback line and a task after the third failure, and the AI stays on", async () => {
    const on = await liveAgency(test);
    const handler = handlerOf(on);
    const from = test.queue.sent.length;
    clockAt(liveNow);
    on.model.answer(FAILED);
    await handler.handle(jobOf(on, on.message.id, 2));
    expect(retries(from)).toEqual([]);
    expect((await outbound(on)).map((line) => line.body)).toEqual([fallbackLine(FIRST_LINE)]);
    const tasks = await on.inOrg((tx) => tx.task.findMany({ where: { byAi: true } }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain(FIRST_LINE);
    expect(tasks[0]).toMatchObject({ recordType: "lead", recordId: on.leadId });
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(state).toMatchObject({ mode: "default", handedOffAt: null });
    expect(state.lastReplyAt?.getTime()).toBe(liveNow.getTime());
    // The model was never asked: the fallback is code's.
    expect(on.model.requests).toHaveLength(0);
  });

  it("retries one's failed model after 1 and 5 minutes", async () => {
    const on = await liveAgency(test);
    await on.inOrg((tx) => setAgent(tx, systemActor(on.organizationId), "one"));
    const handler = handlerOf(on);
    const from = test.queue.sent.length;
    clockAt(liveNow);
    on.model.answer(FAILED);
    await handler.handle(jobOf(on, on.message.id));
    on.model.answer(FAILED);
    await handler.handle(retries(from)[0]?.data ?? {});
    expect(retries(from).map((job) => job.options.startAfter?.getTime())).toEqual([
      liveNow.getTime() + 60_000,
      liveNow.getTime() + 300_000,
    ]);
    expect(await outbound(on)).toEqual([]);
  });

  it("sends one's last try as the fallback line and a task, with no model call", async () => {
    const on = await liveAgency(test);
    await on.inOrg((tx) => setAgent(tx, systemActor(on.organizationId), "one"));
    clockAt(liveNow);
    await handlerOf(on).handle(jobOf(on, on.message.id, 2));
    expect((await outbound(on)).map((line) => line.body)).toEqual([fallbackLine(FIRST_LINE)]);
    expect(await on.inOrg((tx) => tx.task.count({ where: { byAi: true } }))).toBe(1);
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
    expect((await outbound(on)).map((line) => line.body)).toEqual([fallbackLine(FIRST_LINE)]);
  });

  it("still sends the fallback line, a hand-over and a task when the day's cap was reached during the waits", async () => {
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
    expect((await outbound(on)).map((line) => line.body)).toEqual([fallbackLine(FIRST_LINE)]);
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

  it("runs five chats at once", () => {
    expect(handlerOf({ dependencies: () => ({}) } as unknown as LiveAgency).concurrency).toBe(5);
  });
});
