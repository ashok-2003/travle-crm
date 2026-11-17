// The one agent's live turn against the real database, the memory model and the in-memory tool agent (one turn on
// LangGraph itself): the prompt, the trace, the earlier system's lines whole, the limits and the payment screenshot
// before the model, the one more run after a refused booking, and the ends that send nothing (a newer line, a model
// that can't answer) or the fallback line (the steps run out).
import { withTracing, type AiModel } from "@travel-crm/integrations/ai";
import { createMemoryPrompts, type ManagedPrompt } from "@travel-crm/integrations/prompts";
import { createLangGraphToolAgent, createMemoryToolAgent, type ToolAgent } from "@travel-crm/integrations/tool-agent";
import { createMemoryTracing, notedTurn, type MemoryTracing } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replyDayOf } from "../../../src/ai/may-write.js";
import { fallbackLine } from "../../../src/ai/natural/fallback-line.js";
import { BUILT_IN_ONE_PROMPT, ONE_PROMPT_NAME } from "../../../src/ai/one/prompt.js";
import { runOneTurn } from "../../../src/ai/one/turn.js";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { CUSTOMER_NAME, FIRST_LINE, liveAgency, liveAt, liveNow } from "../natural/support/live-agency.js";

const ZONE = "Asia/Kolkata";
const livePrompt: ManagedPrompt = {
  name: ONE_PROMPT_NAME,
  version: 3,
  label: "production",
  text: `${BUILT_IN_ONE_PROMPT.text}\n\nLive prompt marker 3.`,
};
/** Gemini's thought signature, which must go back with every answer of the turn. */
const thought = [{ type: "reasoning.encrypted", data: "signature" }];
const priceWords = "Haan! Kedarkantha har Saturday December mein, ₹9,499 per person triple tent mein.";
const terms = { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" };
const offerCall = { name: "offer_booking", arguments: terms };
const offerWords = "Sat 19 Dec, 2 log, triple sharing: total ₹18,998. Advance ₹6,000 abhi. Book kar doon?";
const bookCall = { name: "book", arguments: terms };
const bookWords = "Done! Sat 19 Dec ki 2 seats hold kar rahi hoon. ₹6,000 advance QR par bhej dijiye.";

describe("the one agent's live turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(options: { prompts?: ManagedPrompt[] } = {}) {
    const on = await liveAgency(test);
    const tracing = createMemoryTracing();
    const prompts = createMemoryPrompts(options.prompts ?? []);
    /** One turn for the customer's line `token` at `at`, on `ai` (the fixture's memory model unless given). */
    const turn = (
      token = on.message.id,
      at = liveNow,
      ai: AiModel = on.model,
      toolAgent: ToolAgent = createMemoryToolAgent(),
    ) =>
      runOneTurn(
        { ...on.dependencies(), ai: withTracing(ai, tracing), tracing, prompts, toolAgent },
        on.turnInput(token),
        at,
      );
    const writes = (text: string, seconds: number) => on.write({ direction: "in", at: liveAt(seconds), body: text });
    const outbound = () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.findMany({
          where: { conversationId: on.chat.id, direction: "out" },
          orderBy: { createdAt: "asc" },
          select: { clientToken: true, body: true },
        }),
      );
    const chatState = () => on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }));
    const aiTask = () =>
      on.inOrg((tx) => tx.task.findFirstOrThrow({ where: { recordType: "lead", recordId: on.leadId, byAi: true } }));
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
    /** The offer's turn: the customer asks for 19 Dec for two, and the model offers it; the yes's line id. */
    const offered = async (toolAgent?: ToolAgent) => {
      const asked = await writes("Kedarkantha 19 Dec, 2 log", -60);
      // Gemini's way: the words beside the call, then nothing once it reads the result.
      on.model.answer({ text: offerWords, toolCalls: [offerCall], reasoningDetails: thought }, "");
      expect(await turn(asked, liveNow, on.model, toolAgent)).toBe("replied");
      return writes("haan, kar do", 240);
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
    /** The chat's day's replies at the agency's cap. */
    const atTheDayCap = () =>
      on.inOrg(async (tx) => {
        const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
        const atTheCap = { repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay };
        await tx.aiChat.upsert({
          where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
          create: { conversationId: on.chat.id, ...atTheCap },
          update: atTheCap,
        });
      });
    /**
     * The customer's yes after the offer, whose booking the act refuses (the seats go while the model writes); the
     * model answers `retry` on its one more run. The yes's line id and the turn's outcome.
     */
    const refusedYes = async (...retry: Parameters<typeof on.model.answer>) => {
      const yes = await offered();
      on.model.answer(
        { toolCalls: [bookCall], reasoningDetails: thought },
        { text: bookWords, reasoningDetails: thought },
        ...retry,
      );
      const outcome = await turn(
        yes,
        liveAt(300),
        during(2, () => holdSeats(19)),
      );
      return { yes, outcome };
    };
    /** What went after the offer's reply, as [token, words]. */
    const sentAfterOffer = async () =>
      (await outbound()).slice(1).map((message) => [message.clientToken, message.body]);
    const bookings = () => on.inOrg((tx) => tx.aiBooking.count({ where: { conversationId: on.chat.id } }));
    return {
      ...on,
      tracing,
      prompts,
      turn,
      writes,
      outbound,
      chatState,
      aiTask,
      during,
      offered,
      atTheDayCap,
      refusedYes,
      sentAfterOffer,
      bookings,
    };
  }

  const tokens = (sent: readonly { clientToken: string | null }[]) => sent.map((message) => message.clientToken);
  const contentOf = (message: { content: string } | undefined) => message?.content ?? "";
  const shown = (tracing: MemoryTracing, index = 0) => {
    const turn = tracing.turns[index];
    return turn === undefined ? null : notedTurn(turn);
  };

  it("answers on Langfuse's production prompt, one trace named whatsapp-agent.one.reply and linked to it", async () => {
    const on = await world({ prompts: [livePrompt] });
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: priceWords });
    expect(await on.turn()).toBe("replied");
    expect(on.prompts.asked).toEqual([{ name: ONE_PROMPT_NAME, label: "production", fresh: false }]);
    expect(contentOf(on.model.requests[0]?.messages[0])).toContain("Live prompt marker 3.");
    expect((await on.outbound()).map((message) => message.body)).toEqual([priceWords]);
    expect((await on.inOrg((tx) => tx.aiUsage.findFirst()))?.calls).toBe(2);

    expect(on.tracing.turns).toHaveLength(1);
    const [turn] = on.tracing.turns;
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.one.reply",
      sessionId: `whatsapp:${on.chat.id}`,
      tags: ["whatsapp-agent", "one", "reply"],
      prompt: { name: ONE_PROMPT_NAME, version: 3 },
      metadata: { agent: "one", promptVersion: `langfuse:${ONE_PROMPT_NAME}@3`, promptLabel: "production" },
    });
    expect(turn?.generations.map((call) => call.prompt)).toEqual([
      { name: ONE_PROMPT_NAME, version: 3 },
      { name: ONE_PROMPT_NAME, version: 3 },
    ]);
    expect(shown(on.tracing)).toMatchObject({
      input: [{ role: "user", content: FIRST_LINE }],
      output: { role: "assistant", content: priceWords },
      statusMessage: "replied",
      metadata: { toolCalls: [expect.objectContaining({ call: 1, name: "get_trip" })], guards: [] },
    });
  });

  it(
    "runs a whole turn on the LangGraph adapter: an offer, then a typed yes holds the seats and sends the payment " +
      "message and QR after the words, under the lead's name",
    async () => {
      const on = await world();
      const langGraph = createLangGraphToolAgent();
      const yes = await on.offered(langGraph);
      expect((await on.chatState())?.facts).toMatchObject({ offer: { startsOn: "2026-12-19", totalPaise: 1_899_800 } });
      on.model.answer({ toolCalls: [bookCall], reasoningDetails: thought }, { text: bookWords });
      expect(await on.turn(yes, liveAt(300), on.model, langGraph)).toBe("replied");
      const sent = await on.outbound();
      expect(tokens(sent).slice(1)).toEqual([`ai:${yes}`, `ai:${yes}:pay`, `ai:${yes}:qr`]);
      expect(sent[1]?.body).toBe(bookWords);
      // The thought signature went back with the call it came with.
      const answered = on.model.requests.at(-1)?.messages.find((message) => message.toolCalls !== undefined);
      expect(answered?.reasoningDetails).toEqual(thought);
      const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
      expect(booking).toMatchObject({ status: "awaiting_payment", leadId: on.leadId });
      const person = await on.inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: on.chat.personId ?? "" } }));
      expect(person.name).toBe(CUSTOMER_NAME);
    },
  );

  it("sends B1 by its id on the LangGraph adapter, captioned with the trip's title for a nameless brochure", async () => {
    const on = await world();
    const asked = await on.writes("Kedarkantha ka brochure bhejo", -60);
    on.model.answer(
      { text: "Ye raha brochure!", toolCalls: [{ name: "send_brochure", arguments: { brochure_id: "B1" } }] },
      "",
    );
    expect(await on.turn(asked, liveNow, on.model, createLangGraphToolAgent())).toBe("replied");
    const sent = await on.inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: on.chat.id, direction: "out" },
        orderBy: { createdAt: "asc" },
        select: { clientToken: true, kind: true, caption: true },
      }),
    );
    expect(tokens(sent)).toEqual([`ai:${asked}`, `ai:${asked}:f1`]);
    expect(sent[1]).toMatchObject({ kind: "document", caption: "Kedarkantha Trek" });
  });

  it("shows the model the earlier system's lines whole", async () => {
    const on = await world();
    const before = new Date("2026-11-10T06:00:00Z");
    await on.write({ direction: "out", at: before, body: "Kedarkantha 2 log: total ₹21,000", clientToken: "ai:old" });
    await on.write({
      direction: "out",
      at: new Date(before.getTime() + 1000),
      kind: "document",
      caption: "Kedarkantha quote ₹21,000",
      fileName: "quote.pdf",
      clientToken: "ai:old:f1",
    });
    on.model.answer({ text: priceWords });
    expect(await on.turn()).toBe("replied");
    const read = (on.model.requests[0]?.messages ?? []).map(contentOf).join("\n");
    expect(read).toContain("Kedarkantha 2 log: total ₹21,000");
    expect(read).toContain("[sent: Kedarkantha quote ₹21,000]");
  });

  it("hands over at the day's cap and a full month with the fallback line, and calls no model", async () => {
    const on = await world();
    await on.atTheDayCap();
    expect(await on.turn()).toBe("handed_off");
    expect(on.model.requests).toEqual([]);
    expect((await on.outbound()).map((message) => message.body)).toEqual([fallbackLine(FIRST_LINE)]);
    expect((await on.chatState())?.handoffReason).toBe("Wrote more than the AI answers in a day");

    const full = await world();
    await full.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(liveNow, ZONE), calls: MONTHLY_AI_LIMIT } }),
    );
    expect(await full.turn()).toBe("handed_off");
    expect(full.model.requests).toEqual([]);
    expect((await full.outbound()).map((message) => message.body)).toEqual([fallbackLine(FIRST_LINE)]);
    expect((await full.chatState())?.handoffReason).toBe("This month's AI replies are used up");
  });

  it("hands over as at the limit when the month's last call goes during the turn", async () => {
    const on = await world();
    await on.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(liveNow, ZONE), calls: MONTHLY_AI_LIMIT - 1 } }),
    );
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: priceWords });
    expect(await on.turn()).toBe("handed_off");
    expect(on.model.requests).toHaveLength(1);
    expect((await on.outbound()).map((message) => message.body)).toEqual([fallbackLine(FIRST_LINE)]);
    expect((await on.chatState())?.handoffReason).toBe("This month's AI replies are used up");
  });

  it("answers a payment screenshot with one call and no tools, and hands it to the team", async () => {
    const on = await world();
    await on.write({ direction: "out", at: liveAt(-100), body: "UPI: casetrips@okbank", clientToken: "ai:turn-1:pay" });
    const photo = await on.write({ direction: "in", at: liveAt(-60), kind: "image" });
    on.model.answer({ text: "Thank you! Check karke yahin confirm karti hoon." });
    expect(await on.turn(photo)).toBe("handed_off");
    expect(on.model.requests).toHaveLength(1);
    expect(on.model.requests[0]?.tools).toBeUndefined();
    expect(contentOf(on.model.requests[0]?.messages.at(-1))).toContain("Their payment screenshot is with you to check");
    expect((await on.outbound()).map((message) => message.body).at(-1)).toBe(
      "Thank you! Check karke yahin confirm karti hoon.",
    );
    expect((await on.chatState())?.handoffReason).toBe(
      "Sent a payment screenshot for you to check: A payment screenshot came in this chat: check it in Payments.",
    );
  });

  it("tries once more when the act can't hold the seats, keeping the reasoning details, then falls back", async () => {
    const on = await world();
    // The model has no answer for the one more run.
    const { yes, outcome } = await on.refusedYes();
    expect(outcome).toBe("fallback");
    const [first, , again] = on.model.requests.slice(-3);
    expect(again?.messages.at(-1)?.content).toContain("The seats couldn't be held");
    // The model that wrote the transcript, and its signatures, answers it.
    expect(again?.model).toBe("memory-model");
    // Every answer of this turn goes back with its thought signature.
    const thisTurn = again?.messages.slice(first?.messages.length) ?? [];
    expect(thisTurn.filter((message) => message.role === "assistant")).toHaveLength(2);
    expect(thisTurn.filter((m) => m.role === "assistant").every((m) => m.reasoningDetails !== undefined)).toBe(true);
    expect(await on.sentAfterOffer()).toEqual([[`ai:${yes}`, fallbackLine("haan, kar do")]]);
    expect((await on.aiTask()).title).toContain("The seats couldn't be held");
    expect(await on.bookings()).toBe(0);
  });

  it("sends the one more run's answer, with no booking, when the act can't hold the seats", async () => {
    const on = await world();
    const otherDate = "Sorry, 19 Dec ki seats abhi chali gayi. Sat 26 Dec chalega? 2 log, total ₹18,998.";
    const { yes, outcome } = await on.refusedYes({ text: otherDate });
    expect(outcome).toBe("replied");
    expect(await on.sentAfterOffer()).toEqual([[`ai:${yes}`, otherDate]]);
    expect(await on.bookings()).toBe(0);
  });

  it("never ends the refused booking's turn silent, nor loses the booking from the team's task", async () => {
    const on = await world();
    // stay_quiet alone, after "Nothing was sent; reply again": the customer still gets a line, the team a task.
    const quiet = { name: "stay_quiet", arguments: { reason: "nothing to add" } };
    const { yes, outcome } = await on.refusedYes({ toolCalls: [quiet] }, "");
    expect(outcome).toBe("fallback");
    expect(await on.sentAfterOffer()).toEqual([[`ai:${yes}`, fallbackLine("haan, kar do")]]);
    expect((await on.aiTask()).title).toContain("The seats couldn't be held");

    // No words twice: the run's own fallback, whose task still names the booking not done.
    const empty = await world();
    expect((await empty.refusedYes("", "")).outcome).toBe("fallback");
    expect((await empty.aiTask()).title).toContain("The seats couldn't be held");
  });

  it("sends nothing when the customer wrote again during the turn", async () => {
    const on = await world();
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: priceWords });
    expect(
      await on.turn(
        on.message.id,
        liveNow,
        on.during(1, () => on.writes("2 log", -5)),
      ),
    ).toBe("superseded");
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

  it("sends nothing when the model fails, for the worker to try again", async () => {
    const on = await world();
    on.model.answer({ ok: false, reason: "unavailable" });
    expect(await on.turn()).toBe("model_failed");
    expect(await on.outbound()).toEqual([]);
    expect((await on.chatState())?.lastReplyAt ?? null).toBeNull();
    expect(shown(on.tracing)).toMatchObject({ statusMessage: "model_failed: unavailable", level: "ERROR" });
  });

  it("falls back with a task when the steps run out", async () => {
    const on = await world();
    // LangGraph's 25 steps: 13 answers, each with a call.
    const lookup = { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] };
    on.model.answer(...Array.from({ length: 13 }, () => lookup));
    expect(await on.turn()).toBe("fallback");
    expect(on.model.requests).toHaveLength(13);
    expect((await on.outbound()).map((message) => message.body)).toEqual([fallbackLine(FIRST_LINE)]);
    expect((await on.aiTask()).title).toContain("too many steps");
  });

  it("hands a b2b enquiry to the team with its sentence", async () => {
    const on = await world();
    const asked = await on.writes("We are a travel agency. What are your B2B rates for Kedarkantha?", -30);
    on.model.answer(
      {
        text: "Main check karke yahin batati hoon.",
        toolCalls: [{ name: "hand_over", arguments: { reason: "b2b", summary: "An agency asking for B2B rates" } }],
      },
      "",
    );
    expect(await on.turn(asked)).toBe("handed_off");
    expect((await on.outbound()).map((message) => message.body)).toEqual(["Main check karke yahin batati hoon."]);
    expect((await on.chatState())?.handoffReason).toBe(
      "Asks about a business booking or agent rates: An agency asking for B2B rates",
    );
  });
});
