// The natural agent's live turn against the real database and the memory model (plan 2, Task 6): the reads, Plan 1's
// loop on the live prompt, then the act in one transaction. What the model wrote goes as it wrote it, after its tools;
// the day's cap and the month's limit hand over with nothing sent and no model call; a payment screenshot gets one
// call with no tools and goes to a person; a booking the act can't take gets one more call; a person or the customer
// writing while the model thinks sends nothing; a model that can't answer sends nothing (the worker tries again). Each
// turn is one trace of its chat, linked to the prompt it ran.
import { naturalPromptLabels } from "@travel-crm/contracts/ai";
import { withTracing, type AiModel } from "@travel-crm/integrations/ai";
import { createMemoryPrompts, type ManagedPrompt } from "@travel-crm/integrations/prompts";
import { createMemoryTracing, notedTurn, type MemoryTracing } from "@travel-crm/integrations/tracing";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_BOOKING_KIND } from "../../../src/ai/booking.js";
import { replyDayOf } from "../../../src/ai/may-write.js";
import { BUILT_IN_NATURAL_PROMPT } from "../../../src/ai/natural/prompt.js";
import { NATURAL_PROMPT_NAME } from "../../../src/ai/natural/prompt-source.js";
import { runNaturalTurn } from "../../../src/ai/natural/turn.js";
import type { LiteDependencies } from "../../../src/ai/lite/types.js";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { FIRST_LINE, liveAgency, liveAt, liveNow } from "./support/live-agency.js";

const ZONE = "Asia/Kolkata";
/** A Langfuse prompt at the live label: the built-in text, with a line the test finds in the system message. */
const livePrompt: ManagedPrompt = {
  name: NATURAL_PROMPT_NAME,
  version: 5,
  label: naturalPromptLabels.live,
  text: `${BUILT_IN_NATURAL_PROMPT.text}\n\nLive prompt marker 5.`,
};
const priceWords = "Yes! Kedarkantha runs every Saturday in December, ₹9,499 per person in a triple tent.";
const offerCall = {
  name: "offer_booking",
  arguments: { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" },
};
const offerWords = "Sat 19 Dec, 2 log, triple sharing: total ₹18,998. Advance ₹6,000 abhi. Pura naam batayenge?";
const bookCall = {
  name: "book",
  arguments: { ...offerCall.arguments, full_name: "Rohan Mehta", customer_words: "haan, Rohan Mehta" },
};
const bookWords =
  "Thank you Rohan ji! Sat 19 Dec ki 2 seats aapke liye hold kar rahe hain. ₹6,000 advance QR par bhej dijiye.";

describe("the natural agent's live turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(options: { prompts?: ManagedPrompt[] } = {}) {
    const on = await liveAgency(test);
    const tracing = createMemoryTracing();
    const prompts = createMemoryPrompts(options.prompts ?? []);
    /**
     * One turn for the customer's line `token` at `at`, on `ai` (the fixture's memory model unless given). Amit manages
     * the agency's settings, so he hears of a booking beside the lead's owner.
     */
    const turn = (token = on.message.id, at = liveNow, ai: AiModel = on.model, extra: Partial<LiteDependencies> = {}) =>
      runNaturalTurn(
        {
          ...on.dependencies(),
          managers: () => Promise.resolve([on.amit.userId]),
          ...extra,
          ai: withTracing(ai, tracing),
          tracing,
          prompts,
        },
        on.turnInput(token),
        at,
      );
    /** The customer writes `text` `seconds` from the clock: the line's id is the token of the turn that answers it. */
    const writes = (text: string, seconds: number) => on.write({ direction: "in", at: liveAt(seconds), body: text });
    const outbound = () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.findMany({
          where: { conversationId: on.chat.id, direction: "out" },
          orderBy: { createdAt: "asc" },
          select: { clientToken: true, body: true, caption: true, kind: true },
        }),
      );
    const chatState = () => on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }));
    /** The model, with `before` run as its `call`th call starts: someone writing while it thinks. */
    const during = (call: number, before: () => Promise<unknown>): AiModel => {
      let calls = 0;
      return {
        configured: true,
        complete: async (request) => {
          calls += 1;
          if (calls === call) await before();
          return on.model.complete(request);
        },
      };
    };
    /** The offer's turn: the customer asks for 19 Dec for two, and the model offers it. */
    const offered = async () => {
      const asked = await writes("Kedarkantha 19 Dec, 2 log", -60);
      on.model.answer({ text: offerWords, toolCalls: [offerCall] });
      expect(await turn(asked)).toBe("replied");
      return writes("haan, Rohan Mehta", 240);
    };
    /** Seats on the 19 Dec batch held for another lead, as staff hold them. */
    const holdSeats = (seats: number) =>
      on.inOrg(async (tx) => {
        const departure = await tx.departure.findFirstOrThrow({
          where: { templateId: on.kedarkantha, startDate: new Date("2026-12-19T00:00:00Z") },
        });
        await tx.departureHold.create({
          data: { departureId: departure.id, leadId: (await aLead(tx)).id, seats, expiresAt: new Date("2027-01-01") },
        });
      });
    return { ...on, tracing, prompts, turn, writes, outbound, chatState, during, offered, holdSeats };
  }

  const tokens = (sent: readonly { clientToken: string | null }[]) => sent.map((message) => message.clientToken);
  const contentOf = (message: { content: string } | undefined) => message?.content ?? "";
  const shown = (tracing: MemoryTracing, index = 0) => {
    const turn = tracing.turns[index];
    return turn === undefined ? null : notedTurn(turn);
  };

  it("sends what the model wrote, after its tools, with every request free of a temperature", async () => {
    const on = await world();
    on.model.answer(
      { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] },
      { text: `${priceWords}\n---\nHow many of you are coming?` },
    );
    expect(await on.turn()).toBe("replied");
    const sent = await on.outbound();
    expect(sent.map((message) => [message.clientToken, message.body])).toEqual([
      [`ai:${on.message.id}`, priceWords],
      [`ai:${on.message.id}:m2`, "How many of you are coming?"],
    ]);
    expect(on.model.requests).toHaveLength(2);
    for (const request of on.model.requests) {
      expect(request).not.toHaveProperty("temperature");
      expect(request).toMatchObject({ feature: "sales_agent", toolChoice: "auto", user: on.organizationId });
    }
    // The feature's list on the first call; the model that answered it on the next (ruling 12).
    expect(on.model.requests.map((request) => request.model)).toEqual([undefined, "memory-model"]);
    // The trip's text went back to the model before it wrote.
    expect(on.model.requests[1]?.messages.some((message) => message.role === "tool")).toBe(true);
    const state = await on.chatState();
    expect(state?.facts).toMatchObject({ agent: "natural", leadId: on.leadId, lastTurnAt: liveNow.toISOString() });
    expect(state?.lastReplyAt).toEqual(liveNow);
    expect((await on.inOrg((tx) => tx.aiUsage.findFirst()))?.calls).toBe(2);
  });

  it("runs on the live prompt from Langfuse, one trace of its chat linked to it, with ids alone at its start", async () => {
    const on = await world({ prompts: [livePrompt] });
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: priceWords });
    expect(await on.turn()).toBe("replied");
    expect(on.prompts.asked).toEqual([{ name: NATURAL_PROMPT_NAME, label: "production", fresh: false }]);
    expect(contentOf(on.model.requests[0]?.messages[0])).toContain("Live prompt marker 5.");

    expect(on.tracing.turns).toHaveLength(1);
    const [turn] = on.tracing.turns;
    expect(turn?.start).toEqual({
      name: "whatsapp-agent.natural.reply",
      sessionId: `whatsapp:${on.chat.id}`,
      organizationId: on.organizationId,
      tags: ["whatsapp-agent", "natural", "reply"],
      prompt: { name: NATURAL_PROMPT_NAME, version: 5 },
      metadata: {
        agent: "natural",
        organizationId: on.organizationId,
        chatId: on.chat.id,
        leadId: on.leadId,
        token: on.message.id,
        promptVersion: `langfuse:${NATURAL_PROMPT_NAME}@5`,
        promptLabel: "production",
      },
    });
    expect(turn?.generations.map((call) => call.prompt)).toEqual([
      { name: NATURAL_PROMPT_NAME, version: 5 },
      { name: NATURAL_PROMPT_NAME, version: 5 },
    ]);
    expect(shown(on.tracing)).toMatchObject({
      input: [{ role: "user", content: FIRST_LINE }],
      output: { role: "assistant", content: priceWords },
      statusMessage: "replied",
      level: "DEFAULT",
      metadata: {
        outcome: "replied",
        promptVersion: `langfuse:${NATURAL_PROMPT_NAME}@5`,
        fallback: null,
        toolCalls: [expect.objectContaining({ call: 1, name: "get_trip" })],
        guards: expect.arrayContaining([expect.objectContaining({ guard: "G1", passed: true })]) as unknown,
        staged: [],
        actions: [],
      },
    });
    expect(on.tracing.strayNotes).toEqual([]);
  });

  it("sends the brochure the model chose, captioned with its trip, and remembers it went", async () => {
    const on = await world();
    on.model.answer({
      text: "Here's the Kedarkantha brochure.",
      toolCalls: [{ name: "send_brochure", arguments: { trip_id: "T1" } }],
    });
    expect(await on.turn()).toBe("replied");
    const sent = await on.outbound();
    expect(sent.map((message) => [message.clientToken, message.body ?? message.caption])).toEqual([
      [`ai:${on.message.id}`, "Here's the Kedarkantha brochure."],
      [`ai:${on.message.id}:f1`, "Kedarkantha Trek"],
    ]);
    expect((await on.chatState())?.facts).toMatchObject({
      sentTripIds: [on.kedarkantha],
      sentFileIds: [on.brochureId],
    });
  });

  it("offers, then holds the seats on the customer's yes and sends the agency's payment lines and QR", async () => {
    const on = await world();
    const yes = await on.offered();
    expect((await on.chatState())?.facts).toMatchObject({ offer: { startsOn: "2026-12-19", totalPaise: 1_899_800 } });
    on.model.answer({ text: bookWords, toolCalls: [bookCall] });
    expect(await on.turn(yes, liveAt(300))).toBe("replied");
    const sent = await on.outbound();
    expect(tokens(sent).slice(1)).toEqual([`ai:${yes}`, `ai:${yes}:pay`, `ai:${yes}:qr`]);
    expect(sent[2]?.body).toBe("UPI: casetrips@okbank");
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(booking).toMatchObject({ status: "awaiting_payment", leadId: on.leadId });
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead.stage).toBe("booking_requested");
    const told = await on.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: AI_BOOKING_KIND }, select: { recipientUserId: true } }),
    );
    expect(told.map((one) => one.recipientUserId).sort()).toEqual([on.owner.userId, on.amit.userId].sort());
  });

  it("hands over in the model's words when it calls hand_over", async () => {
    const on = await world();
    const asked = await on.writes("Can you do 20% off for 6 of us?", -30);
    on.model.answer({
      text: "Let me check this and get back to you here.",
      toolCalls: [{ name: "hand_over", arguments: { reason: "discount", summary: "Wants 20% off for 6 people" } }],
    });
    expect(await on.turn(asked)).toBe("handed_off");
    expect((await on.outbound()).map((message) => message.body)).toEqual([
      "Let me check this and get back to you here.",
    ]);
    const state = await on.chatState();
    expect(state?.handedOffAt).toEqual(liveNow);
    expect(state?.handoffReason).toBe("Asked for a discount or a better price: Wants 20% off for 6 people");
  });

  it("hands over at the day cap with nothing sent, without a model call", async () => {
    const on = await world();
    await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const atTheCap = { repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay };
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, ...atTheCap },
        update: atTheCap,
      });
    });
    expect(await on.turn()).toBe("handed_off");
    expect(on.model.requests).toEqual([]);
    expect(await on.outbound()).toEqual([]);
    expect((await on.chatState())?.handoffReason).toBe("Wrote more than the AI answers in a day");

    // The month's calls used up: the same, with its own reason.
    const full = await world();
    await full.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(liveNow, ZONE), calls: MONTHLY_AI_LIMIT } }),
    );
    expect(await full.turn()).toBe("handed_off");
    expect(full.model.requests).toEqual([]);
    expect(await full.outbound()).toEqual([]);
    expect((await full.chatState())?.handoffReason).toBe("This month's AI credits are used up");
  });

  it("thanks for a payment screenshot in the model's words and hands over for payment_check", async () => {
    const on = await world();
    await on.write({ direction: "out", at: liveAt(-100), body: "UPI: casetrips@okbank", clientToken: "ai:turn-1:pay" });
    const photo = await on.write({ direction: "in", at: liveAt(-60), kind: "image" });
    on.model.answer({ text: "Thank you! I'll check it and confirm here." });
    expect(await on.turn(photo)).toBe("handed_off");
    expect(on.model.requests).toHaveLength(1);
    expect(on.model.requests[0]?.tools).toBeUndefined();
    expect(contentOf(on.model.requests[0]?.messages.at(-1))).toContain("Their payment screenshot is with you to check");
    expect((await on.outbound()).map((message) => message.body).at(-1)).toBe(
      "Thank you! I'll check it and confirm here.",
    );
    expect((await on.chatState())?.handoffReason).toBe(
      "Sent a payment screenshot for you to check: A payment screenshot came in this chat: check it in Payments.",
    );
  });

  it("takes one more call when the act can't hold the seats, and offers the open date", async () => {
    const on = await world();
    const yes = await on.offered();
    // The seats go while the model writes: book was staged on seats that were there.
    on.model.answer(
      { toolCalls: [bookCall] },
      { text: bookWords },
      {
        text: "Sorry Rohan ji, 19 Dec ki seats abhi chali gayi. Sat 26 Dec, 2 log, triple: total ₹18,998. Advance ₹6,000. Chalega?",
        toolCalls: [{ ...offerCall, arguments: { ...offerCall.arguments, date: "2026-12-26" } }],
      },
    );
    expect(
      await on.turn(
        yes,
        liveAt(300),
        on.during(2, () => on.holdSeats(19)),
      ),
    ).toBe("replied");
    const again = contentOf(on.model.requests.at(-1)?.messages.at(-1));
    expect(again).toContain("[app check, not from the customer] The seats couldn't be held:");
    expect(again).toContain("Open: Sat 5 Dec, Sat 12 Dec, Sat 26 Dec.");
    expect(again).toContain("Nothing was sent; reply again.");
    const sent = await on.outbound();
    expect(tokens(sent).slice(1)).toEqual([`ai:${yes}`]);
    expect(sent.at(-1)?.body).toContain("Sat 26 Dec");
    expect(await on.inOrg((tx) => tx.aiBooking.count({ where: { conversationId: on.chat.id } }))).toBe(0);
    expect((await on.chatState())?.facts).toMatchObject({ offer: { startsOn: "2026-12-26" } });
  });

  it("sends nothing more and leaves a task when no call is left after the act refused the booking", async () => {
    const on = await world();
    const yes = await on.offered();
    on.model.answer(
      { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] },
      { toolCalls: [{ name: "quote", arguments: offerCall.arguments }] },
      { toolCalls: [bookCall] },
      { text: bookWords },
    );
    expect(
      await on.turn(
        yes,
        liveAt(300),
        on.during(4, () => on.holdSeats(19)),
      ),
    ).toBe("fallback");
    expect(on.model.requests).toHaveLength(5);
    const sent = await on.outbound();
    expect(sent.slice(1)).toEqual([]);
    const task = await on.inOrg((tx) =>
      tx.task.findFirstOrThrow({ where: { recordType: "lead", recordId: on.leadId, byAi: true } }),
    );
    expect(task.title).toContain("The seats couldn't be held");
    expect(await on.inOrg((tx) => tx.aiBooking.count({ where: { conversationId: on.chat.id } }))).toBe(0);
  });

  it("tells only the team when the retry's booking is refused too", async () => {
    const on = await world();
    const yes = await on.offered();
    on.model.answer({ toolCalls: [bookCall] }, { text: bookWords }, { toolCalls: [bookCall] }, { text: bookWords });
    // The seats go as the first act runs, are back for the retry's booking, and go again before its act.
    let calls = 0;
    const flickering: AiModel = {
      configured: true,
      complete: async (request) => {
        calls += 1;
        if (calls === 2 || calls === 4) await on.holdSeats(19);
        if (calls === 3) await on.inOrg((tx) => tx.departureHold.updateMany({ data: { expiresAt: new Date(0) } }));
        return on.model.complete(request);
      },
    };
    expect(await on.turn(yes, liveAt(300), flickering)).toBe("fallback");
    // The offer's call, then two for the first act and two for the retry, both refused.
    expect(on.model.requests).toHaveLength(5);
    const sent = await on.outbound();
    expect(sent.slice(1)).toEqual([]);
    const task = await on.inOrg((tx) =>
      tx.task.findFirstOrThrow({ where: { recordType: "lead", recordId: on.leadId, byAi: true } }),
    );
    expect(task.title).toContain("The seats couldn't be held");
  });

  it("ends model_failed, logged by code, when what the act needs can't be read", async () => {
    const on = await world();
    const yes = await on.offered();
    const logger = createMemoryLogger();
    on.model.answer({ toolCalls: [bookCall] }, { text: bookWords });
    const managers = () => Promise.reject(new Error("connection timeout for +919876543210"));
    expect(await on.turn(yes, liveAt(300), on.model, { managers, logger })).toBe("model_failed");
    expect(tokens(await on.outbound())).toEqual([expect.anything()]);
    const failure = logger.entries.find((entry) => entry.reason === "act_deps_failed");
    expect(failure).toMatchObject({ level: "error", conversationId: on.chat.id });
    expect(JSON.stringify(logger.entries)).not.toContain("9876543210");
  });

  it("sends nothing when a person replies while the model is thinking", async () => {
    const on = await world();
    on.model.answer({ text: priceWords });
    const person = on.during(1, () =>
      on.write({ direction: "out", at: liveAt(-10), origin: "staff_crm", sentBy: on.owner.userId, body: "Hi Rahul!" }),
    );
    expect(await on.turn(on.message.id, liveNow, person)).toBe("answered");
    expect(tokens(await on.outbound())).toEqual([null]);
    expect((await on.chatState())?.lastReplyAt ?? null).toBeNull();
  });

  it("supersedes quietly when the customer writes again during the loop", async () => {
    const on = await world();
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: priceWords });
    const customer = on.during(1, () => on.writes("2 log", -5));
    expect(await on.turn(on.message.id, liveNow, customer)).toBe("superseded");
    expect(on.model.requests).toHaveLength(1);
    expect(await on.outbound()).toEqual([]);

    // Their line lands while the last call writes the words: the act gives way to the newer turn.
    const late = await world();
    late.model.answer({ text: priceWords });
    expect(
      await late.turn(
        late.message.id,
        liveNow,
        late.during(1, () => late.writes("2 log", -5)),
      ),
    ).toBe("superseded");
    expect(await late.outbound()).toEqual([]);
  });

  it("ends model_failed with nothing sent when the model can't answer", async () => {
    const on = await world();
    on.model.answer({ ok: false, reason: "unavailable" });
    expect(await on.turn()).toBe("model_failed");
    expect(await on.outbound()).toEqual([]);
    expect((await on.chatState())?.lastReplyAt ?? null).toBeNull();
    expect(shown(on.tracing)).toMatchObject({ statusMessage: "model_failed: unavailable", level: "ERROR" });
  });

  it("opens a lead for a returning customer before it offers", async () => {
    const on = await world();
    const closed = await on.inOrg(async (tx) => {
      const leads = await tx.lead.findMany({ where: { personId: on.chat.personId ?? "" }, select: { id: true } });
      await tx.lead.updateMany({ where: { id: { in: leads.map((one) => one.id) } }, data: { stage: "won" } });
      return leads.map((one) => one.id);
    });
    const asked = await on.writes("Kedarkantha 19 Dec, 2 log", -60);
    on.model.answer({ text: offerWords, toolCalls: [offerCall] });
    expect(await on.turn(asked)).toBe("replied");
    const fresh = await on.inOrg((tx) =>
      tx.lead.findFirstOrThrow({ where: { personId: on.chat.personId ?? "", id: { notIn: closed } } }),
    );
    expect(fresh).toMatchObject({ source: "whatsapp", ownerUserId: on.owner.userId, stage: "quote_sent" });
    expect((await on.chatState())?.facts).toMatchObject({ leadId: fresh.id, offer: { startsOn: "2026-12-19" } });
    expect(shown(on.tracing)?.metadata?.actions).toContain("lead:opened");
  });

  /** Every lead the chat's person had is closed, so the turn finds none open; the ids of those closed. */
  const closeLeads = (on: Awaited<ReturnType<typeof world>>) =>
    on.inOrg(async (tx) => {
      const leads = await tx.lead.findMany({ where: { personId: on.chat.personId ?? "" }, select: { id: true } });
      await tx.lead.updateMany({ where: { id: { in: leads.map((one) => one.id) } }, data: { stage: "won" } });
      return leads.map((one) => one.id);
    });

  it("opens a lead for the question task when the fallback answers a returning customer", async () => {
    const on = await world();
    const closed = await closeLeads(on);
    const asked = await on.writes("Kedarkantha ka rate?", -60);
    // A price the tools never showed, twice: the guards give up, and the team gets the question.
    const invented = { text: "Kedarkantha ka rate ₹7,777 per person hai." };
    on.model.answer(invented, invented);
    expect(await on.turn(asked)).toBe("fallback");
    const fresh = await on.inOrg((tx) =>
      tx.lead.findFirstOrThrow({ where: { personId: on.chat.personId ?? "", id: { notIn: closed } } }),
    );
    const task = await on.inOrg((tx) => tx.task.findFirstOrThrow({ where: { recordType: "lead", byAi: true } }));
    expect(task.recordId).toBe(fresh.id);
  });

  it("opens a lead for the hand-over at the day cap when the customer has only closed leads", async () => {
    const on = await world();
    const closed = await closeLeads(on);
    await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const atTheCap = { repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay };
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, ...atTheCap },
        update: atTheCap,
      });
    });
    expect(await on.turn()).toBe("handed_off");
    const open = await on.inOrg((tx) =>
      tx.lead.findMany({ where: { personId: on.chat.personId ?? "", id: { notIn: closed } } }),
    );
    expect(open).toHaveLength(1);
    expect((await on.chatState())?.facts).toMatchObject({ leadId: open[0]?.id });
  });
});
