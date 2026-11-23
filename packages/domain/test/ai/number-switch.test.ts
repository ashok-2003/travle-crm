// Each WhatsApp number's own AI switch, under the agency's (spec 2026-11-22 section 8, Review Focus 4): the AI answers in a
// chat only while the agency's switch is on, the chat's number has its switch on and isn't disconnected. A number switched
// off queues no turn and shows no AI mark, a turn already under way sends nothing, and keyword trip kits go out there by
// themselves. Staff turn one number's switch on and off, audited; the setup lists the live numbers; the minute job walks
// each agency once however many numbers it has.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agentAnswers, agentSetupOf, aiCustomerWroteListener, chatAiOf, runAiNudges } from "../../src/ai/index.js";
import { assertStillAnswering, stoppedSince, type ActGateInput } from "../../src/ai/lite/act-gates.js";
import { chatRowOf } from "../../src/ai/may-write.js";
import {
  numberAnswers,
  removeRoute,
  sendTripKitOnKeyword,
  setNumberAnswers,
  upsertRoute,
} from "../../src/inbox/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import {
  aConnectedAgency,
  aSecondNumber,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestConnection,
  type TestInbox,
} from "../inbox/support.js";
import { liteAgency, liteEntitlements, liteToday, liteTurnAt } from "./lite/support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;
type Chat = Agency["chat"];

describe("each number's AI switch", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  afterEach(() => vi.useRealTimers());

  /** The agency's main number, as the inbox's helpers take it. */
  const mainOf = (on: Agency): TestConnection => ({
    organizationId: on.organizationId,
    connectionId: on.chat.connectionId,
    integratedNumber: "",
  });

  /** Another number in the agency ("Sales 2" unless told), with a customer's chat on it. */
  async function anotherNumber(on: Agency, options: { label?: string } = {}) {
    const number = await aSecondNumber(test, mainOf(on), options);
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(number, { customerNumber, text: "Is the trek on?" }), testNow);
    const chat = await on.inOrg((tx) =>
      tx.whatsappConversation.findFirstOrThrow({ where: { connectionId: number.connectionId } }),
    );
    const message = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { conversationId: chat.id, direction: "in" } }),
    );
    return { ...number, chat, message };
  }

  const switchNumber = (on: Agency, connectionId: string, value: boolean) =>
    on.inOrg((tx) => setNumberAnswers(tx, on.owner, { connectionId, on: value }));

  const agencySwitch = (on: Agency, autopilot: boolean) =>
    on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot } }));

  const cardOf = (on: Agency, chat: Chat) =>
    on.inOrg((tx) =>
      chatAiOf(tx, { organizationId: on.organizationId, conversationId: chat.id, available: true, now: liteTurnAt }),
    );

  const gateInput = (on: Agency, chat: Chat, token: string): ActGateInput => ({
    organizationId: on.organizationId,
    conversationId: chat.id,
    token,
    kind: "reply",
    now: liteTurnAt,
    timeZone: "Asia/Kolkata",
  });

  /** A customer's message as the worker hands it on: the turns it queued and the chat's AI mark. */
  async function customerWrote(on: Agency, chat: Chat, messageId: string) {
    vi.useFakeTimers({ now: liteTurnAt, toFake: ["Date"] });
    const before = test.queue.sent.length;
    const context: ListenerContext = { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) };
    await aiCustomerWroteListener({
      queue: test.queue,
      subscriptions: { entitlementsOf: () => Promise.resolve(liteEntitlements) },
    }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: chat.id, messageId, firstEver: false },
        occurredAt: testNow,
      },
      context,
    );
    vi.useRealTimers();
    const mark = (await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: chat.id } })))?.turnState;
    return { queues: test.queue.sent.slice(before).map((job) => job.queue), mark: mark ?? null };
  }

  it("answers on a number whose switch is on and not on one switched off, the agency's switch on", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await switchNumber(on, other.connectionId, false);

    expect(await on.inOrg((tx) => numberAnswers(tx, on.chat.id))).toBe(true);
    expect(await on.inOrg((tx) => numberAnswers(tx, other.chat.id))).toBe(false);
    expect(await cardOf(on, on.chat)).toMatchObject({ answering: true, numberOff: false });
    expect(await cardOf(on, other.chat)).toMatchObject({ answering: false, numberOff: true });
    expect(await on.inOrg((tx) => stoppedSince(tx, gateInput(on, on.chat, on.message.id), chatRowOf(on.chat)))).toBe(
      null,
    );
    expect(
      await on.inOrg((tx) => stoppedSince(tx, gateInput(on, other.chat, other.message.id), chatRowOf(other.chat))),
    ).toBe("off");
  });

  it("answers on no number while the agency's switch is off, whatever the numbers say", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await agencySwitch(on, false);
    expect(agentAnswers("default", false, true)).toBe(false);
    expect(agentAnswers("on", false, true)).toBe(false);
    for (const chat of [on.chat, other.chat]) {
      expect(await cardOf(on, chat)).toMatchObject({ answering: false, agent: "off" });
    }
    expect(await customerWrote(on, other.chat, other.message.id)).toEqual({ queues: [], mark: null });
  });

  it("queues no turn and shows no AI mark for a chat on a number switched off", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await switchNumber(on, other.connectionId, false);
    expect(await customerWrote(on, other.chat, other.message.id)).toEqual({ queues: [], mark: null });
    expect(await customerWrote(on, on.chat, on.message.id)).toEqual({ queues: ["ai.reply"], mark: "queued" });
  });

  it("stops a turn whose number is switched off before it acts", async () => {
    const on = await liteAgency(test);
    await switchNumber(on, on.chat.connectionId, false);
    const input = gateInput(on, on.chat, on.message.id);
    expect(await on.inOrg((tx) => stoppedSince(tx, input, chatRowOf(on.chat)))).toBe("off");
    await expect(on.inOrg((tx) => assertStillAnswering(tx, input))).rejects.toMatchObject({
      reason: "AGENT_STOPPED",
    });
    expect(await on.turn()).toBe("off");
    const sent = await on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }));
    expect(sent).toBe(0);
  });

  it("answers nothing in a disconnected number's chat", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await on.inOrg((tx) =>
      tx.whatsappConnection.update({ where: { id: other.connectionId }, data: { status: "disconnected" } }),
    );
    expect(await on.inOrg((tx) => numberAnswers(tx, other.chat.id))).toBe(false);
    expect(await cardOf(on, other.chat)).toMatchObject({ answering: false });
    expect(await customerWrote(on, other.chat, other.message.id)).toEqual({ queues: [], mark: null });
  });

  it("sends a keyword trip kit on a number whose AI is off while the other's answers", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await switchNumber(on, on.chat.connectionId, false);
    await on.inOrg((tx) =>
      tx.tripKit.create({
        data: { name: "Trek", message: "The trek's itinerary and price", keywords: ["trek"], autoSend: true },
      }),
    );
    const actor = systemActor(on.organizationId);
    const keyword = (chat: Chat, messageId: string) =>
      sendTripKitOnKeyword(test.dependencies, actor, { conversationId: chat.id, messageId }, testNow);
    // The second number's AI answers there, and sends what it chooses: no kit by itself.
    expect(await keyword(other.chat, other.message.id)).toBe(false);
    await on.say("Tell me about the trek");
    const asked = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { conversationId: on.chat.id, body: "Tell me about the trek" } }),
    );
    expect(await keyword(on.chat, asked.id)).toBe(true);
    const kit = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { body: "The trek's itinerary and price" } }),
    );
    expect(kit.conversationId).toBe(on.chat.id);
  });

  it("turns one number's AI on and off, audited, and refuses another agency's number", async () => {
    const on = await liteAgency(test);
    const other = await anotherNumber(on);
    await switchNumber(on, other.connectionId, false);
    await switchNumber(on, other.connectionId, false);
    await switchNumber(on, other.connectionId, true);
    const row = await on.inOrg((tx) => tx.whatsappConnection.findUniqueOrThrow({ where: { id: other.connectionId } }));
    expect(row.aiAnswers).toBe(true);
    const entries = await on.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: other.connectionId }, orderBy: { id: "asc" } }),
    );
    expect(entries).toMatchObject([
      { action: "whatsapp.number-ai-off", before: { aiAnswers: true }, after: { aiAnswers: false } },
      { action: "whatsapp.number-ai-on", before: { aiAnswers: false }, after: { aiAnswers: true } },
    ]);

    const elsewhere = await aConnectedAgency(test);
    await expect(switchNumber(on, elsewhere.connectionId, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists the live numbers and their switches in the setup, and counts the connected ones", async () => {
    const on = await liteAgency(test);
    const second = await aSecondNumber(test, mainOf(on), { label: "Sales 2" });
    const third = await aSecondNumber(test, mainOf(on), { label: "Sales 3", status: "setup" });
    await aSecondNumber(test, mainOf(on), { label: "Sales 4", status: "disconnected" });
    await switchNumber(on, second.connectionId, false);
    const setup = await on.inOrg((tx) => agentSetupOf(tx, on.organizationId, liteToday));
    expect(setup.numbers).toEqual([
      { id: on.chat.connectionId, label: "WhatsApp", aiAnswers: true },
      { id: second.connectionId, label: "Sales 2", aiAnswers: false },
      { id: third.connectionId, label: "Sales 3", aiAnswers: true },
    ]);
    expect(setup.steps.find((step) => step.key === "whatsapp")).toMatchObject({ done: true, count: 2 });
  });

  it("walks each agency once for the AI's nudges, however many numbers it has", async () => {
    const on = await liteAgency(test);
    // A second number sorting after a hundred others' routes: a walk by route would reach the agency on two pages.
    const second = `9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const connectionId = await on.inOrg(async (tx) => {
      const row = await tx.whatsappConnection.create({
        data: {
          integratedNumber: second,
          displayNumber: `+${second}`,
          mode: "new_number",
          status: "connected",
          label: "Sales 2",
        },
        select: { id: true },
      });
      return row.id;
    });
    await upsertRoute(test.db, { integratedNumber: second, organizationId: on.organizationId, connectionId });
    const filler = await aConnectedAgency(test);
    const fillers = Array.from({ length: 100 }, (_, index) => ({
      integratedNumber: `9189${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}${String(index).padStart(2, "0")}`,
      organizationId: filler.organizationId,
      connectionId: randomUUID(),
    }));
    try {
      for (const route of fillers) await upsertRoute(test.db, route);
      const asked: string[] = [];
      const entitlementsOf = (id: string): Promise<Entitlements | null> => {
        asked.push(id);
        return Promise.resolve(id === on.organizationId ? liteEntitlements : null);
      };
      await runAiNudges(
        {
          db: test.db,
          identity: on.identity,
          ai: createMemoryAiModel(),
          logger: createMemoryLogger(),
          subscriptions: { entitlementsOf },
          agencyName: () => Promise.resolve("Test agency"),
          files: test.files,
          managers: () => Promise.resolve([]),
        },
        () => liteTurnAt,
      );
      expect(asked.filter((id) => id === on.organizationId)).toHaveLength(1);
    } finally {
      for (const route of fillers) await removeRoute(test.db, route.organizationId, route.connectionId);
    }
  });
});
