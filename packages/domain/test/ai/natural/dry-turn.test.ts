// The natural agent's dry turn on agency T (Try it, the bench): one turn of the live loop on the posted chat and the state
// the last turn handed back, on the agency's own data, with every action described and none done; only the month's AI
// calls are kept. A turn's guards read this turn's offer, the Team lines of the last 30 days and whole trip text.
import { naturalFacts, type DryLead, type TestAiLine } from "@travel-crm/contracts/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BUILT_IN_NATURAL_PROMPT,
  naturalDryRun,
  naturalDryTurn,
  naturalDryTurnInFull,
  type NaturalChatLine,
  type NaturalPrompt,
} from "../../../src/ai/index.js";
import { stampOf } from "../../../src/ai/natural/context/chat-turns.js";
import { dryAnswerOf } from "../../../src/ai/natural/dry-answer.js";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { naturalAgency } from "./support/natural-agency.js";

// Mon 16 Nov 2026, noon in Kolkata.
const NOW = new Date("2026-11-16T06:30:00Z");
const ZONE = "Asia/Kolkata";
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const clock = { today: parseCalendarDate("2026-11-16"), timeZone: ZONE };

const offerCall = {
  name: "offer_booking",
  arguments: { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" },
};
const offerWords = "Sat 19 Dec, 2 log, triple sharing: total ₹18,998. Advance ₹6,000 abhi. Pura naam batayenge?";

describe("the natural agent's dry turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(options: { trips?: number } = {}) {
    const agency = await naturalAgency(test, options);
    const { organizationId, model } = agency;
    const deps = { db: test.db, ai: model, agencyName: () => Promise.resolve("Case Trips") };
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    /** One Try it turn: the chat so far (a bare string is the customer's line) and the state the last turn handed back. */
    const dry = (
      lines: readonly (string | TestAiLine)[],
      state: Parameters<typeof naturalDryRun>[2]["state"] = null,
      now = NOW,
    ) =>
      naturalDryRun(
        deps,
        memberOf(organizationId, "org-owner"),
        {
          messages: lines.map((line) => (typeof line === "string" ? { from: "customer" as const, text: line } : line)),
          state,
          prompt: BUILT_IN_NATURAL_PROMPT,
        },
        now,
      );
    /** One turn as the bench runs it: chat lines with their own times and kinds. */
    const turn = (lines: NaturalChatLine[]) =>
      naturalDryTurnInFull(deps, organizationId, {
        lines,
        state: null,
        now: NOW,
        prompt: BUILT_IN_NATURAL_PROMPT,
        choice: {},
      });
    /** Every table a live turn would write, counted: a dry turn leaves them all as they were. */
    const rows = () =>
      inOrg(async (tx) => ({
        messages: await tx.whatsappMessage.count(),
        holds: await tx.departureHold.count(),
        bookings: await tx.aiBooking.count(),
        notes: await tx.leadNote.count(),
        timeline: await tx.leadTimelineEntry.count(),
        fields: await tx.leadAiField.count(),
        tasks: await tx.task.count(),
        chats: await tx.aiChat.count(),
        leads: await tx.lead.count(),
      }));
    const usedThisMonth = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    const [kedarkantha = ""] = agency.packageIds;
    return { ...agency, deps, inOrg, dry, turn, rows, usedThisMonth, kedarkantha };
  }

  const line = (id: number, from: NaturalChatLine["from"], at: Date, text: string): NaturalChatLine => ({
    id: `line-${String(id)}`,
    from,
    at,
    kind: "text",
    text,
  });
  const contentOf = (message: { content: string } | undefined) => message?.content ?? "";

  it("answers a greeting on the agency's own data, sending nothing and keeping nothing but usage", async () => {
    const on = await world();
    const before = await on.rows();
    on.model.answer({ text: "Hi! Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai aur kitne log?" });
    const answer = await on.dry(["Hi"]);
    expect(answer).toMatchObject({
      outcome: "replied",
      messages: [expect.stringContaining("₹9,499")],
      payment: null,
      actions: [],
      history: [
        { from: "agent", text: "Hi! Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai aur kitne log?" },
      ],
      state: { facts: { agent: "natural", lastTurnAt: NOW.toISOString() }, lead: { stage: "new" } },
    });
    expect(contentOf(on.model.requests[0]?.messages[0])).toContain("Kedarkantha Trek");
    expect(on.model.requests[0]).toMatchObject({ feature: "sales_agent", toolChoice: "auto" });
    expect(await on.rows()).toEqual(before);
    expect(await on.usedThisMonth()).toBe(1);
  });

  it("carries what update_lead saved into the next turn's lead block", async () => {
    const on = await world();
    on.model.answer(
      {
        text: "December mein 2 log, badhiya! Kaunsi date dekhein?",
        toolCalls: [{ name: "update_lead", arguments: { trip_id: "T1", month: "2026-12", adults: 2 } }],
      },
      { text: "Sat 19 Dec ko seats open hain." },
    );
    const asked = "Kedarkantha December mein, 2 log";
    const first = await on.dry([asked]);
    expect(first.actions).toEqual([{ tool: "update_lead", fields: ["trip", "dates", "adults"] }]);
    expect(first.state.lead).toMatchObject({
      packageId: on.kedarkantha,
      month: "2026-12",
      adults: 2,
      stage: "contacted",
    });
    await on.dry([asked, ...first.history, "19 Dec?"], first.state, later(5));
    expect(contentOf(on.model.requests[1]?.messages.at(-1))).toContain(
      "No name yet · trip T1 · December, no day yet · 2 adults · stage Contacted",
    );
  });

  it("would hold the seats after an offer and a yes, and shows the agency's payment lines", async () => {
    const on = await world();
    const before = await on.rows();
    on.model.answer(
      { text: offerWords, toolCalls: [offerCall] },
      {
        text: "Thank you Rohan ji! Sat 19 Dec ki 2 seats aapke liye hold kar rahe hain. ₹6,000 advance QR par bhej dijiye.",
        toolCalls: [
          {
            name: "book",
            arguments: { ...offerCall.arguments, full_name: "Rohan Mehta", customer_words: "haan, Rohan Mehta" },
          },
        ],
      },
    );
    const asked = "Kedarkantha 19 Dec, 2 log";
    const first = await on.dry([asked]);
    expect(first).toMatchObject({
      actions: [
        { tool: "offer_booking", trip: "Kedarkantha Trek", date: "2026-12-19", people: 2, totalPaise: 1_899_800 },
      ],
      state: { facts: { offer: { totalPaise: 1_899_800, at: NOW.toISOString() } }, lead: { stage: "quote_sent" } },
    });
    const second = await on.dry([asked, ...first.history, "haan, Rohan Mehta"], first.state, later(10));
    expect(second).toMatchObject({
      actions: [expect.objectContaining({ tool: "book", seats: 2 })],
      payment: ["UPI: casetrips@okbank"],
      state: {
        facts: { offer: null, lastTurnAt: later(10).toISOString() },
        lead: {
          stage: "booking_requested",
          booking: { packageId: on.kedarkantha, startsOn: "2026-12-19", advancePaise: 600_000 },
        },
      },
    });
    expect(second.history.at(-1)).toEqual({
      from: "agent",
      text: "[held: 2 seats on Sat 19 Dec; payment details sent]",
    });
    // Pre-flight #10: the lines up to our last stand at the last turn's time, the customer's new line at now.
    const asking = on.model.requests[1]?.messages ?? [];
    expect(contentOf(asking[1])).toBe(`[${stampOf(NOW, clock)}] ${asked}`);
    expect(contentOf(asking.at(-1))).toContain(`[${stampOf(later(10), clock)}] haan, Rohan Mehta`);
    expect(await on.rows()).toEqual(before);
  });

  it("ends the offer after a turn that sent nothing, so the next turn block shows none", async () => {
    const on = await world();
    on.model.answer(
      { text: offerWords, toolCalls: [offerCall] },
      { toolCalls: [{ name: "stay_quiet", arguments: { reason: "asking his wife" } }] },
      { text: "Bilkul! Pura naam bata dijiye, offer phir se bana deti hoon." },
    );
    const asked = "Kedarkantha 19 Dec, 2 log";
    const first = await on.dry([asked]);
    const waiting = [asked, ...first.history, "wife se puch ke batata hoon"];
    const quiet = await on.dry(waiting, first.state, later(5));
    expect(quiet).toMatchObject({ messages: [], state: { facts: { offer: null } } });
    // book would refuse that offer as dead (made before the last turn that ran), and the context says so too.
    await on.dry([...waiting, "ok, book it"], quiet.state, later(30));
    expect(contentOf(on.model.requests[2]?.messages.at(-1))).toContain("Live offer: none.");
  });

  it("lets the next turn repeat the live offer's figures, a total no price table gives included", async () => {
    const on = await world();
    on.model.answer({ text: offerWords, toolCalls: [offerCall] });
    const asked = "Kedarkantha 19 Dec, 2 log";
    const first = await on.dry([asked]);
    const { offer } = first.state.facts;
    // As if a child's place had made the offer's total: ₹24,498, less the ₹6,000 advance.
    const facts = { ...first.state.facts, offer: offer === null ? null : { ...offer, totalPaise: 2_449_800 } };
    const again = "Total ₹24,498, advance ₹6,000 abhi, balance ₹18,498 trek se pehle.";
    // Refused, the same words would come back on the retry.
    on.model.answer({ text: again }, { text: again });
    const second = await on.dry([asked, ...first.history, "total kitna tha?"], { ...first.state, facts }, later(5));
    expect(second).toMatchObject({ outcome: "replied", messages: [again] });
  });

  it("keeps a quote's total the words state as told, and moves the lead to Quote sent", async () => {
    const on = await world();
    on.model.answer(
      { toolCalls: [{ name: "quote", arguments: { trip_id: "T1", date: "2026-12-19", adults: 2 } }] },
      { text: "Sat 19 Dec, 2 log: total ₹18,998, GST included." },
    );
    const answer = await on.dry(["Kedarkantha 19 Dec, 2 log, kitna?"]);
    expect(answer).toMatchObject({ actions: [], state: { lead: { stage: "quote_sent" } } });
    expect(answer.state.facts.told).toEqual([
      {
        packageId: on.kedarkantha,
        startsOn: "2026-12-19",
        adults: 2,
        childrenAges: [],
        room: "triple",
        totalPaise: 1_899_800,
        at: NOW.toISOString(),
      },
    ]);
  });

  it("keeps an offer's total the words state as told (ruling 17)", async () => {
    const on = await world();
    on.model.answer({ text: offerWords, toolCalls: [offerCall] });
    const answer = await on.dry(["Kedarkantha 19 Dec, 2 log"]);
    expect(answer.state.facts.told).toEqual([
      {
        packageId: on.kedarkantha,
        startsOn: "2026-12-19",
        adults: 2,
        childrenAges: [],
        room: "triple",
        totalPaise: 1_899_800,
        at: NOW.toISOString(),
      },
    ]);
  });

  it("hands over in words of the model's own, with the reason in the actions", async () => {
    const on = await world();
    const words = "Main team ko bata deti hoon, woh yahin reply karenge.";
    const summary = "Asked for 20% off Kedarkantha for a group of 6.";
    on.model.answer({ text: words, toolCalls: [{ name: "hand_over", arguments: { reason: "discount", summary } }] });
    expect(await on.dry(["6 log hain, 20% discount milega?"])).toMatchObject({
      outcome: "handed_off",
      messages: [words],
      actions: [{ tool: "hand_over", reason: "discount", summary }],
    });
  });

  it("answers the fallback line and a task when the model can't answer", async () => {
    const on = await world();
    on.model.answer({ ok: false, reason: "unavailable" });
    const line = "Ye team se check karke yahin batate hain.";
    const answer = await on.dry(["Kedarkantha ka rate?"]);
    expect(answer).toMatchObject({
      outcome: "fallback",
      messages: [line],
      payment: null,
      actions: [
        { tool: "create_task", kind: "question", text: expect.stringContaining("1 and 5 minutes later") as string },
      ],
      history: [{ from: "agent", text: line }],
      trace: { outcome: "fallback", fallback: "model_failed:unavailable" },
    });
    expect(answer.state.lead.tasks).toHaveLength(1);
    // No model answered: the call is given back.
    expect(await on.usedThisMonth()).toBe(0);
  });

  it("answers a turn that gave way to a newer line as a model failure, never with an error", () => {
    // A dry turn has no newer line to give way to; were it to end so, Try it and the bench still get an answer.
    const lead: DryLead = {
      packageId: null,
      day: null,
      month: null,
      adults: null,
      childrenAges: [],
      pickupCity: null,
      room: null,
      name: null,
      stage: "new",
      notes: [],
      tasks: [],
      booking: null,
    };
    const state = { facts: naturalFacts.parse({ agent: "natural" }), lead };
    const read = {
      now: NOW,
      today: clock.today,
      sheets: [],
      paymentLines: null,
      state,
      newText: "Kedarkantha ka rate?",
    };
    const trace = startNaturalTrace(BUILT_IN_NATURAL_PROMPT, NOW.getTime());
    expect(dryAnswerOf({ end: "superseded" }, read, trace, NOW.getTime())).toMatchObject({
      outcome: "fallback",
      messages: ["Ye team se check karke yahin batate hain."],
      actions: [{ tool: "create_task", kind: "question" }],
      trace: { outcome: "fallback", fallback: "model_failed:superseded" },
    });
  });

  it("throws AI_LIMIT_REACHED when the month's calls are used up", async () => {
    const on = await world();
    await on.inOrg((tx) => tx.aiUsage.create({ data: { month: monthStartOf(NOW, ZONE), calls: MONTHLY_AI_LIMIT } }));
    on.model.answer("never asked");
    await expect(on.dry(["Hi"])).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "AI_LIMIT_REACHED" });
    expect(on.model.requests).toHaveLength(0);
  });

  it("throws AI_NOT_READY when this server has no model for the new agent", async () => {
    const on = await world();
    await expect(on.dry(["Hi"])).rejects.toMatchObject({ reason: "AI_NOT_READY" });
  });

  it("records the prompt's version in the trace, and the Langfuse label it came from", async () => {
    const on = await world();
    on.model.answer({ text: "Hi! Kab ka plan hai?" }, { text: "Hi! Kab ka plan hai?" });
    const turnOn = (prompt: NaturalPrompt) =>
      naturalDryTurn(on.deps, on.organizationId, {
        lines: [line(1, "customer", NOW, "Hi")],
        state: null,
        now: NOW,
        prompt,
        choice: {},
      });
    const draft = {
      version: "langfuse:whatsapp-agent/natural-system@7",
      text: BUILT_IN_NATURAL_PROMPT.text,
      source: { name: "whatsapp-agent/natural-system", version: 7, label: "draft" },
    };
    expect((await turnOn(draft)).trace).toMatchObject({
      agent: "natural",
      promptVersion: "langfuse:whatsapp-agent/natural-system@7",
      promptLabel: "draft",
      outcome: "replied",
    });
    expect((await turnOn(BUILT_IN_NATURAL_PROMPT)).trace).toMatchObject({
      promptVersion: "built-in-1",
      promptLabel: null,
    });
  });

  it("sends two messages split at a line of ---, a list with blank lines whole, and adds each to the history", async () => {
    const on = await world();
    const list = "Kedarkantha mein:\n\n• Tents aur homestay\n• Saare meals\n\nPorter alag se.";
    on.model.answer({ text: `${list}\n---\nAapke group mein kitne log hain?` });
    const answer = await on.dry(["Kedarkantha mein kya included hai?"]);
    expect(answer.messages).toEqual([list, "Aapke group mein kitne log hain?"]);
    expect(answer.history).toEqual([
      { from: "agent", text: list },
      { from: "agent", text: "Aapke group mein kitne log hain?" },
    ]);
  });

  it("adds [sent: …] and [offered: …] marks to the history", async () => {
    const on = await world();
    const words = `Brochure bhej rahi hoon. ${offerWords}`;
    on.model.answer({
      text: words,
      toolCalls: [{ name: "send_brochure", arguments: { trip_id: "T1" } }, offerCall],
    });
    const answer = await on.dry(["Kedarkantha ka brochure bhejo, 19 Dec ke liye 2 log"]);
    expect(answer.history).toEqual([
      { from: "agent", text: words },
      { from: "agent", text: "[sent: Kedarkantha Trek brochure]" },
      { from: "agent", text: "[offered: Sat 19 Dec, 2 adults, triple, total ₹18,998, advance ₹6,000]" },
    ]);
    expect(answer.actions).toContainEqual({ tool: "send_brochure", trip: "Kedarkantha Trek", files: 1 });
    expect(answer.state.facts.sentTripIds).toEqual([on.kedarkantha]);
  });

  it("gives a payment screenshot one call with no tools, and hands it to the team to check", async () => {
    const on = await world();
    on.model.answer({ text: "Thank you! The team will check it and reply here." });
    const { answer } = await on.turn([{ ...line(1, "customer", NOW, ""), kind: "image", mayBePayment: true }]);
    expect(answer).toMatchObject({
      outcome: "handed_off",
      messages: ["Thank you! The team will check it and reply here."],
      actions: [{ tool: "hand_over", reason: "payment_check" }],
    });
    expect(on.model.requests[0]?.tools).toBeUndefined();
    expect(contentOf(on.model.requests[0]?.messages.at(-1))).toContain(
      "Their screenshot went to the team to check; this chat goes to the team after your reply.",
    );
  });

  it("gives a voice note nobody could play one call with no tools, and keeps the chat with the agent", async () => {
    const on = await world();
    on.model.answer({ text: "Sorry, voice note play nahi ho raha. Type karke bata denge?" });
    const { answer } = await on.turn([{ ...line(1, "customer", NOW, ""), kind: "audio", untranscribed: true }]);
    expect(answer).toMatchObject({ outcome: "replied", actions: [] });
    expect(on.model.requests[0]?.tools).toBeUndefined();
    expect(contentOf(on.model.requests[0]?.messages.at(-1))).toContain("Their voice note couldn't be played");
  });

  it("gives the guards this turn's offer, the Team lines of the last 30 days, the answers and the trips' text", async () => {
    const on = await world();
    on.model.answer({ text: offerWords, toolCalls: [offerCall] });
    const recent = "Rohan ji, ₹1,000 off for your group of 4.";
    const { answer, guardContext, flagContext } = await on.turn([
      { ...line(1, "team", daysAgo(40), "₹500 off for students this winter."), teamName: "Amit" },
      { ...line(2, "team", daysAgo(3), recent), teamName: "Amit" },
      line(3, "customer", NOW, "Kedarkantha 19 Dec, 2 log"),
    ]);
    expect(answer.outcome).toBe("replied");
    expect(guardContext).toMatchObject({
      teamText: recent,
      offer: { startsOn: "2026-12-19", totalPaise: 1_899_800, advancePaise: 600_000 },
      customerText: "Kedarkantha 19 Dec, 2 log",
    });
    expect(guardContext.ownerText).toContain("10 and above, with a parent.");
    expect(guardContext.ownerText).toContain("Dehradun to Sankri");
    expect(flagContext.sheets.map((sheet) => sheet.label)).toEqual(["T1", "T2"]);
  });

  it("grounds no figure from a Team line the model's window left out, nor reads a customer line it left out", async () => {
    const on = await world();
    on.model.answer({ text: "Kedarkantha ₹9,499 per person se shuru hai." });
    // Six lines of the last week fill the window, so the lines of three weeks ago, inside 30 days, are out of it.
    const week = [1, 2, 3, 4, 5, 6].map((day) =>
      day % 2 === 0
        ? line(10 + day, "you", daysAgo(7 - day), "Ji, batayiye.")
        : line(10 + day, "customer", daysAgo(7 - day), "Kedarkantha ke baare mein batao"),
    );
    const { guardContext } = await on.turn([
      line(1, "customer", daysAgo(21), "Students ke liye ₹2,345 wala offer hai?"),
      { ...line(2, "team", daysAgo(20), "₹1,234 off for students this winter."), teamName: "Amit" },
      ...week,
      line(20, "customer", NOW, "Kedarkantha ka rate?"),
    ]);
    expect(guardContext.teamText).toBe("");
    expect(guardContext.grounded.has(123_400, false)).toBe(false);
    expect(guardContext.customerText).not.toContain("₹2,345");
    expect(guardContext.customerText).toContain("Kedarkantha ka rate?");
  });

  it("offers the lookups with the trips inline, and get_trip reads past the sheet's cut", async () => {
    const on = await world();
    const notes = `${"Carry warm layers, gloves and a cap; nights at camp drop below zero. ".repeat(7)}A mule costs ₹1,200 a day.`;
    await on.inOrg((tx) => tx.quoteTemplate.update({ where: { id: on.kedarkantha }, data: { notes } }));
    const mule = "Haan, bag ke liye mule ₹1,200 per day mein milta hai.";
    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: mule });
    const { answer } = await on.turn([line(1, "customer", NOW, "Kedarkantha pe bag ke liye mule milega? Kitna?")]);
    const [asked, afterRead] = on.model.requests;
    expect(asked?.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining(["find_trips", "get_trip"]));
    // Both trips are inline, their notes cut to the budget, so the price is past the cut.
    expect(contentOf(asked?.messages[0])).toContain("Day 1, Dehradun to Sankri");
    expect(contentOf(asked?.messages[0])).not.toContain("₹1,200");
    expect(contentOf(afterRead?.messages.at(-1))).toContain("A mule costs ₹1,200 a day.");
    expect(answer).toMatchObject({ outcome: "replied", messages: [mule] });
  });

  it("grounds a figure past a sheet's cut once get_trip has read the trip whole", async () => {
    // 16 trips with long text are past the trips' budget, so they are indexed and get_trip is offered; T1's mule price
    // sits past its notes' cut.
    const on = await world({ trips: 16 });
    const long = (most: number) => "Carry warm layers, gloves and a cap; nights at camp drop below zero. ".repeat(most);
    await on.inOrg(async (tx) => {
      await tx.quoteTemplate.updateMany({
        data: {
          summary: long(5),
          inclusions: long(9),
          exclusions: long(6),
          notes: long(6),
          cancellationNotes: long(6),
        },
      });
      await tx.quoteTemplate.update({
        where: { id: on.kedarkantha },
        data: { notes: `${long(7)}A mule for your bag costs ₹1,200 a day.` },
      });
    });
    const mule = "Haan, bag ke liye mule ₹1,200 per day mein milta hai.";
    const asked = [line(1, "customer", NOW, "Kedarkantha pe bag ke liye mule milega? Kitna?")];

    on.model.answer({ toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] }, { text: mule });
    const read = await on.turn(asked);
    expect(on.model.requests[0]?.tools?.map((tool) => tool.name)).toContain("get_trip");
    expect(read.answer).toMatchObject({ outcome: "replied", messages: [mule] });
    expect(read.guardContext.ownerText).toContain("₹1,200");

    // Without get_trip the cut sheet holds no ₹1,200: refused, retried, then the fallback line.
    on.model.answer({ text: mule }, { text: mule });
    const unread = await on.turn(asked);
    expect(unread.answer).toMatchObject({ outcome: "fallback", trace: { fallback: "guard:G1" } });
    expect(unread.guardContext.ownerText).not.toContain("₹1,200");
  });
});
