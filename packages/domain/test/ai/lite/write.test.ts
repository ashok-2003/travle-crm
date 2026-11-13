// The Write step: blanks filled by code, every answer checked, at most two asks; and the code-written parts of a reply.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/index.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import {
  composeReply,
  fixedPartOf,
  liteReplyContext,
  writeMove,
  writeMoveOf,
  type LiteWritten,
  type WritingAgency,
} from "../../../src/ai/lite/write.js";
import type { Move, PriceFacts, Situation } from "../../../src/ai/lite/types.js";
import { anAgency } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";

const P1 = "0198f6c0-0000-7000-8000-000000000001";
const D1 = "0198f6c0-0000-7000-8000-0000000000d1";
const D2 = "0198f6c0-0000-7000-8000-0000000000d2";
const today = parseCalendarDate("2026-11-12");
const zone = "Asia/Kolkata";
const now = new Date("2026-11-12T10:20:00Z");
const agency: WritingAgency = {
  agencyName: "Hills Travel",
  agentName: "Riya",
  answers: { payment_methods: "Pay by UPI; part payment is allowed." },
};
const facts = (over: Partial<LiteFacts> = {}): LiteFacts =>
  liteFacts.parse({
    agent: "lite",
    packageId: P1,
    adults: 3,
    children: { count: 1, ages: [8] },
    roomType: "double",
    ...over,
  });
const price = (over: Partial<PriceFacts> = {}): PriceFacts => ({
  packageId: P1,
  roomType: "double",
  fromPaise: 599_900,
  perPersonPaise: 750_000,
  totalPaise: 3_000_000,
  advancePaise: 800_000,
  advancePerPersonPaise: 200_000,
  rooms: [],
  travellers: 4,
  departure: { id: D1, startsOn: parseCalendarDate("2026-12-15"), freeSeats: 4 },
  ...over,
});
const situation = (over: Partial<Situation> = {}): Situation => ({
  package: {
    id: P1,
    title: "Kedarnath Yatra",
    place: "Kedarnath",
    destinationId: null,
    nights: 4,
    startCity: "Delhi",
    pickups: ["Delhi"],
    offered: ["double"],
    adultRooms: ["double"],
    departures: [
      { id: D1, startsOn: parseCalendarDate("2026-12-15"), freeSeats: 4 },
      { id: D2, startsOn: parseCalendarDate("2026-12-22"), freeSeats: 12 },
    ],
  },
  price: price(),
  looked: [],
  ...over,
});
const prompt = (language: "english" | "hindi" | "hinglish" = "english") => ({
  agentName: "Riya",
  agencyName: "Hills Travel",
  tone: "friendly" as const,
  summary: "",
  messages: [{ id: "m1", from: "customer" as const, at: now, kind: "text", text: "Which dates?" }],
  language,
  timeZone: zone,
  today,
});
const reply = (text: string, cannotAnswer = false) => JSON.stringify({ text, cannot_answer: cannotAnswer });
const datesMove: Move = { kind: "give_dates", packageId: P1, departureIds: [D1, D2], ask: null };

describe("what the model is told, and what code writes", () => {
  it("the blanks name departures; a seat count only at 5 or fewer; no date or amount is shown", () => {
    const move = writeMoveOf(datesMove, situation(), facts(), agency, today);
    const lines = move?.blanks.lines() ?? [];
    expect(lines.some((line) => line.startsWith("[date 1]"))).toBe(true);
    expect(lines.some((line) => line.startsWith("[date 2]"))).toBe(true);
    expect(lines.filter((line) => line.startsWith("[seats"))).toHaveLength(1);
    expect(lines.join("\n")).not.toMatch(/Dec|₹|\b12\b/);
    expect(move?.blanks.values().get("[seats 1]")).toBe("4");
  });

  it("give_price with no ask, and the moves code writes whole, give the model nothing", () => {
    const none = (move: Move) => writeMoveOf(move, situation(), facts(), agency, today);
    expect(none({ kind: "give_price", packageId: P1, price: "full", ask: null })).toBeNull();
    expect(none({ kind: "book", packageId: P1, departureId: D1 })).toBeNull();
    expect(none({ kind: "resend_payment" })).toBeNull();
    expect(none({ kind: "fixed", text: "close" })).toBeNull();
    expect(none({ kind: "hand_over", reason: "loop" })).toBeNull();
    expect(none({ kind: "silent" })).toBeNull();
    const asked = none({ kind: "give_price", packageId: P1, price: "full", ask: "pickup" });
    expect(asked?.instruction).toContain("which city they will join from");
  });

  it("a follow-up picks the chat up again: the first asks the item or for questions, the second asks nothing", () => {
    const told = (move: Move) => writeMoveOf(move, situation(), facts(), agency, today)?.instruction;
    expect(told({ kind: "follow_up", number: 1, ask: "people" })).toBe(
      "Pick the chat up again in one short, friendly line, then ask for how many people are travelling, and the children's ages if any.",
    );
    expect(told({ kind: "follow_up", number: 1, ask: null })).toBe(
      "Pick the chat up again in one short, friendly line and ask whether they have any questions.",
    );
    expect(told({ kind: "follow_up", number: 2, ask: null })).toBe(
      "Write one short, friendly last line: they can message here any time. Ask nothing.",
    );
  });

  it("the owner's answer is a hidden [answer] blank, quoted as written", () => {
    const move = writeMoveOf(
      { kind: "answer_agency", topic: "payment_methods", ask: null },
      situation(),
      facts(),
      agency,
      today,
    );
    expect(move?.blanks.lines().join("\n")).not.toContain("UPI");
    expect(move?.blanks.values().get("[answer]")).toBe("Pay by UPI; part payment is allowed.");
  });

  it("greet quotes the starting price as a hidden blank", () => {
    const index = [
      {
        id: P1,
        title: "Kedarnath Yatra",
        place: "Kedarnath",
        destinationId: null,
        nights: 4,
        startCity: "Delhi",
        fromPaise: 599_900,
      },
    ];
    const move = writeMoveOf(
      { kind: "greet", packageIds: [P1] },
      situation({ package: null }),
      facts(),
      agency,
      today,
      index,
    );
    expect(move?.blanks.values().get("[from 1]")).toBe("₹5,999");
    expect(move?.blanks.lines().join("\n")).not.toContain("₹5,999");
  });

  it("the full price states the total beside the advance, with the seats left when few", () => {
    const part = fixedPartOf(
      { kind: "give_price", packageId: P1, price: "full", ask: null },
      situation(),
      facts(),
      "english",
      "Hills Travel",
      today,
    );
    expect(part?.text).toBe(
      "Kedarnath Yatra, Tue 15 Dec: ₹7,500 per person (double sharing). For 3 adults, 1 child, the total is ₹30,000. Advance to book: ₹8,000. Seats left on this date: 4.",
    );
    const roomy = situation({
      price: price({ departure: { id: D2, startsOn: parseCalendarDate("2026-12-22"), freeSeats: 12 } }),
    });
    const many = fixedPartOf(
      { kind: "give_price", packageId: P1, price: "full", ask: null },
      roomy,
      facts(),
      "english",
      "Hills Travel",
      today,
    );
    expect(many?.text).not.toContain("Seats left");
  });

  it("a 'from' price says from, in all three languages, and never uses the room's price", () => {
    const from = (language: "english" | "hindi" | "hinglish") =>
      fixedPartOf(
        { kind: "give_price", packageId: P1, price: "from", ask: null },
        situation(),
        facts(),
        language,
        "Hills Travel",
        today,
      )?.text;
    expect(from("english")).toBe("Kedarnath Yatra: from ₹5,999 per person.");
    expect(from("hindi")).toBe("Kedarnath Yatra: ₹5,999 प्रति व्यक्ति से शुरू।");
    expect(from("hinglish")).toBe("Kedarnath Yatra: ₹5,999 per person se shuru.");
  });

  it("a full price that cannot be told falls back to the 'from' price, or to nothing", () => {
    const move: Move = { kind: "give_price", packageId: P1, price: "full", ask: null };
    const noTotal = situation({ price: price({ totalPaise: null }) });
    expect(fixedPartOf(move, noTotal, facts(), "english", "Hills Travel", today)?.text).toContain("from ₹5,999");
    const nothing = situation({ price: price({ totalPaise: null, fromPaise: null }) });
    expect(fixedPartOf(move, nothing, facts(), "english", "Hills Travel", today)).toBeNull();
  });

  it("identity names the agency, not_run the customer's words cut at 40, the rest are the model's", () => {
    const part = (move: Move, over: Partial<LiteFacts> = {}) =>
      fixedPartOf(move, situation(), facts(over), "english", "Hills Travel", today);
    expect(part({ kind: "fixed", text: "identity" })?.text).toBe(
      "I'm Hills Travel's assistant on WhatsApp. Someone from the team can join any time.",
    );
    const long = "x".repeat(60);
    expect(part({ kind: "fixed", text: "not_run" }, { notRun: ["Goa", long] })?.text).toContain(
      `${"x".repeat(40)} right now`,
    );
    expect(part({ kind: "greet", packageIds: [] })).toBeNull();
    expect(part({ kind: "hand_over", reason: "loop" })).toBeNull();
  });

  it("composeReply joins by a blank line and shifts the spans", () => {
    const one = { text: "A 1.", filled: [{ start: 2, end: 3 }] };
    const two = { text: "B 2.", filled: [{ start: 2, end: 3 }] };
    const whole = composeReply([one, null, two]);
    expect(whole.text).toBe("A 1.\n\nB 2.");
    expect(whole.filled.map(({ start, end }) => whole.text.slice(start, end))).toEqual(["1", "2"]);
  });

  it("the reply context knows the trip's place, the customer's own and the ones not run", () => {
    const context = liteReplyContext(situation(), facts({ pickupCity: "Pune", notRun: ["Goa"] }), ["Kedarnath", "Goa"]);
    expect(context.packagePlaces).toContain("Kedarnath");
    expect(context.customerPlaces).toEqual(["Pune"]);
    expect(context.notRun).toEqual(["Goa"]);
  });
});

describe("writeMove", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function run(
    answers: (string | { ok: false; reason: "unavailable" })[],
    options: {
      language?: "english" | "hindi" | "hinglish";
      sent?: string[];
      limit?: boolean;
      chosen?: Move;
      writing?: WritingAgency;
    } = {},
  ) {
    const organizationId = await anAgency(test, "Lite write agency");
    if (options.limit === true) {
      await test.db.forOrg(organizationId, (tx) =>
        tx.aiUsage.create({ data: { month: monthStartOf(now, zone), calls: MONTHLY_AI_LIMIT } }),
      );
    }
    const ai = createMemoryAiModel();
    ai.answer(...answers);
    const move = writeMoveOf(options.chosen ?? datesMove, situation(), facts(), options.writing ?? agency, today);
    if (move === null) throw new Error("no move");
    const context = liteReplyContext(situation(), facts(), ["Kedarnath"]);
    const written: LiteWritten = await writeMove(
      ai,
      { db: test.db, organizationId, now, timeZone: zone },
      prompt(options.language),
      move,
      context,
      options.sent ?? [],
    );
    return { ai, written };
  }

  it("a typed price is asked again, then refused", async () => {
    const { ai, written } = await run([reply("It costs ₹5,999 per person."), reply("It is ₹5,999 for you.")]);
    expect(written).toMatchObject({ kind: "refused", code: "amount" });
    expect(ai.requests).toHaveLength(2);
    expect(ai.requests[0]?.messages[1]?.content).not.toContain("## Correction");
    const second = ai.requests[1]?.messages[1]?.content ?? "";
    expect(second).toContain("## Correction");
    expect(second).toContain("amount");
  });

  it("a good second answer is used, with the blanks filled and skipped by the check", async () => {
    const { written } = await run([
      reply("It costs ₹5,999."),
      reply("We leave on [date 1] (only [seats 1] seats left) or [date 2]. Which suits you?"),
    ]);
    expect(written.kind).toBe("ok");
    if (written.kind !== "ok") return;
    expect(written.text).toBe("We leave on Tue 15 Dec (only 4 seats left) or Tue 22 Dec. Which suits you?");
    expect(written.refusals).toEqual(["amount"]);
    expect(written.raw).toHaveLength(2);
    expect(written.filled.map(({ start, end }) => written.text.slice(start, end))).toEqual([
      "Tue 15 Dec",
      "4",
      "Tue 22 Dec",
    ]);
  });

  it("an unknown blank is asked again with its name", async () => {
    const { ai, written } = await run([reply("The total is [total]."), reply("We leave on [date 1].")]);
    expect(written.kind).toBe("ok");
    expect(ai.requests[1]?.messages[1]?.content).toContain("unknown_blank");
    expect(ai.requests[1]?.messages[1]?.content).toContain("[total]");
  });

  it("cannot_answer comes back as cannot_answer, with no second ask", async () => {
    const { ai, written } = await run([reply("", true)]);
    expect(written).toEqual({ kind: "cannot_answer", raw: [reply("", true)] });
    expect(ai.requests).toHaveLength(1);
  });

  it("an empty text that does not say cannot_answer is not sent", async () => {
    const { written } = await run([reply(""), reply("  ")]);
    expect(written).toMatchObject({ kind: "refused", code: "empty" });
  });

  it("four sentences are refused as sentences", async () => {
    const four = reply("We leave on [date 1]. It is fun. The views are great. Book soon.");
    const { written } = await run([four, four]);
    expect(written).toMatchObject({ kind: "refused", code: "sentences" });
  });

  it("a Hindi answer in Latin letters is refused as script", async () => {
    const latin = reply("Hum [date 1] ko nikalte hain.");
    const { written } = await run([latin, latin], { language: "hindi" });
    expect(written).toMatchObject({ kind: "refused", code: "script" });
  });

  it("a Hindi answer in Devanagari passes", async () => {
    const { written } = await run([reply("हम [date 1] को निकलते हैं।")], { language: "hindi" });
    expect(written.kind).toBe("ok");
  });

  it("I'm a bot is refused as persona", async () => {
    const bot = reply("I'm a bot, we leave on [date 1].");
    const { written } = await run([bot, bot]);
    expect(written).toMatchObject({ kind: "refused", code: "persona" });
  });

  it.each([
    "Only 3 seats left, we leave on [date 1].",
    "सिर्फ 3 सीटें बची हैं।",
    "Call 9876543210 for [date 1].",
    "Call +91 98765 43210.",
    "₹५,९९९ per person on [date 1].",
    "२० नवंबर को निकलेंगे।",
    "Only three seats left on [date 1].",
    "सिर्फ तीन सीटें बची हैं।",
  ])("a typed figure is refused as number: %s", async (text) => {
    const { written, ai } = await run([reply(text), reply(text)], {
      language:
        /[\u0900-\u097F]/.test(text) && !text.includes("Call") && !text.includes("per person") ? "hindi" : "english",
    });
    expect(written.kind).toBe("refused");
    expect(written.kind === "refused" ? written.code : "").toMatch(/^(number|amount|date)$/);
    expect(ai.requests).toHaveLength(2);
  });

  it("a figure typed by the model is code 'number' when no other check names it", async () => {
    const { written } = await run([reply("Only 3 seats left."), reply("Only 3 seats left.")]);
    expect(written).toMatchObject({ kind: "refused", code: "number" });
    const phone = await run([reply("Call 9876543210 now."), reply("Call 9876543210 now.")]);
    expect(phone.written).toMatchObject({ kind: "refused" });
  });

  it.each([
    "Do seat bachi hain [date 1] ko.",
    "Sirf teen seats bachi hain, [date 1] ko.",
    "Bas ek seat bachi hai.",
    "Chaar seats hi bache hain.",
    "Seats bachi: paanch.",
  ])("a seat count in Hinglish words is refused as number: %s", async (text) => {
    const { written } = await run([reply(text), reply(text)], { language: "hinglish" });
    expect(written).toMatchObject({ kind: "refused", code: "number" });
  });

  it("a seat count inside a span code filled passes: the agency's own answer may say it", async () => {
    const writing = { ...agency, answers: { children: "Children ride free; we keep three seats for families." } };
    const { written } = await run([reply("[answer]")], {
      chosen: { kind: "answer_agency", topic: "children", ask: null },
      writing,
    });
    expect(written).toMatchObject({ kind: "ok", text: "Children ride free; we keep three seats for families." });
  });

  it("figures code filled are not refused", async () => {
    const { written } = await run([reply("Only [seats 1] seats left on [date 1].")]);
    expect(written.kind).toBe("ok");
  });

  it("a payment claim is refused by the reply check", async () => {
    const claim = reply("We received your payment, we leave on [date 1].");
    const { written } = await run([claim, claim]);
    expect(written).toMatchObject({ kind: "refused", code: "payment_claim" });
  });

  it("two emojis become one", async () => {
    const { written } = await run([reply("We leave on [date 1] 🙂 see you 🏔️")]);
    expect(written).toMatchObject({ kind: "ok", text: "We leave on Tue 15 Dec 🙂 see you" });
  });

  it("a repeat of a message already sent is asked again", async () => {
    const sent = ["We leave on Tue 15 Dec and again on Tue 22 Dec, which suits you better?"];
    const { written } = await run(
      [
        reply("We leave on [date 1] and again on [date 2], which suits you better?"),
        reply("Two departures: [date 1] or [date 2]. Pick one?"),
      ],
      { sent },
    );
    expect(written).toMatchObject({ kind: "ok", refusals: ["repeat"] });
  });

  it("the limit on the first ask ends the write", async () => {
    const { ai, written } = await run([reply("We leave on [date 1].")], { limit: true });
    expect(written).toMatchObject({ kind: "ended", outcome: "limit" });
    expect(ai.requests).toHaveLength(0);
  });

  it("the model being down on the first ask ends the write; on the second it is a refusal", async () => {
    const down = { ok: false, reason: "unavailable" } as const;
    expect((await run([down])).written).toMatchObject({ kind: "ended", outcome: "unavailable" });
    expect((await run([reply("It is ₹5,999."), down])).written).toMatchObject({ kind: "refused", code: "amount" });
  });
});
