// The inbox never says the AI answers a chat its turn will refuse (plan 5's final review, I1): the chat's state and the
// worker's "the AI has the message" mark both need the agency's agent switched on with its setup finished, as well as the
// chat's own mode. A chat set "On" adds nothing to an agent that is off. A message to an agent whose setup is unfinished
// still queues its turn, which ends not_ready and tells the owner, but nothing says the AI has it.
import { randomUUID } from "node:crypto";
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { aiChatResumedListener, aiCustomerWroteListener, chatAiOf } from "../../src/ai/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt } from "./lite/support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;

describe("whether the AI answers a chat, as the inbox says it", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  afterEach(() => vi.useRealTimers());

  const switchedOn = (on: Agency, autopilot: boolean) =>
    on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot } }));
  /** The setup comes undone: the agency's payment QR is removed. */
  const withoutQr = (on: Agency) =>
    on.inOrg((tx) =>
      tx.attachment.updateMany({
        where: { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE },
        data: { deletedAt: new Date() },
      }),
    );
  const stateOf = (on: Agency) =>
    on.inOrg((tx) =>
      chatAiOf(tx, {
        organizationId: on.organizationId,
        conversationId: on.chat.id,
        available: true,
        now: liteTurnAt,
      }),
    );

  it("answers a chat set On only while the agent is on with its setup finished", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.aiChat.create({
        data: { conversationId: on.chat.id, mode: "on", turnState: "queued", turnAt: new Date() },
      }),
    );
    expect(await stateOf(on)).toMatchObject({ mode: "on", agent: "ready", answering: true, turn: "queued" });

    await switchedOn(on, false);
    expect(await stateOf(on)).toMatchObject({ mode: "on", agent: "off", answering: false, turn: null });

    await switchedOn(on, true);
    await withoutQr(on);
    expect(await stateOf(on)).toMatchObject({ mode: "on", agent: "not_ready", answering: false, turn: null });
  });

  it("says nothing of the agent where the AI is not available", async () => {
    const on = await liteAgency(test);
    const state = await on.inOrg((tx) =>
      chatAiOf(tx, {
        organizationId: on.organizationId,
        conversationId: on.chat.id,
        available: false,
        now: liteTurnAt,
      }),
    );
    expect(state).toMatchObject({ available: false, answering: false, agent: "off" });
  });

  /** A customer's message as the worker hands it on, with the clock at the fixture's turn. */
  async function customerWrote(on: Agency) {
    vi.useFakeTimers({ now: liteTurnAt, toFake: ["Date"] });
    const before = test.queue.sent.length;
    const context: ListenerContext = { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) };
    const subscriptions = { entitlementsOf: () => Promise.resolve(liteEntitlements) };
    await aiCustomerWroteListener({ queue: test.queue, subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: on.chat.id, messageId: on.message.id, firstEver: false },
        occurredAt: testNow,
      },
      context,
    );
    await aiChatResumedListener({ queue: test.queue, subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "ai.chat-resumed",
        payload: { conversationId: on.chat.id },
        occurredAt: testNow,
      },
      context,
    );
    vi.useRealTimers();
    const mark = (await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } })))?.turnState;
    return { queues: test.queue.sent.slice(before).map((job) => job.queue), mark: mark ?? null };
  }

  it("marks a message as the AI's only when the agent will answer it", async () => {
    const ready = await liteAgency(test);
    expect(await customerWrote(ready)).toEqual({ queues: ["ai.reply", "ai.reply"], mark: "queued" });

    const off = await liteAgency(test);
    await switchedOn(off, false);
    await off.inOrg((tx) => tx.aiChat.create({ data: { conversationId: off.chat.id, mode: "on" } }));
    expect(await customerWrote(off)).toEqual({ queues: [], mark: null });

    // Its turn still runs, to end not_ready and tell the owner; nothing in the inbox says the AI has the message.
    const undone = await liteAgency(test);
    await withoutQr(undone);
    expect(await customerWrote(undone)).toEqual({ queues: ["ai.reply", "ai.reply"], mark: null });
  });
});
