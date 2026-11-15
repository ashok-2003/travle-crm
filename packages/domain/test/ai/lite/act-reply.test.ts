// What the act step is handed once Write has answered: the composed words, or a hand-over when no safe words came. A
// move with nothing to say never goes out silent, and a fixed text that cannot be filled never throws out of the turn.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { actingOn, codeWordsOf, handOverInstead } from "../../../src/ai/lite/act-reply.js";
import type { Decision, Move, Situation } from "../../../src/ai/lite/types.js";
import { formatRupees, parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-10");
const facts = (changes: Partial<LiteFacts> = {}): LiteFacts => ({
  ...liteFacts.parse({ agent: "lite" }),
  packageId: "pkg",
  ...changes,
});
const decision = (move: Move, changes: Partial<Decision> = {}): Decision => ({
  move,
  stage: "package_picked",
  why: "intent:test",
  facts: facts(),
  stopFollowUps: false,
  note: null,
  task: null,
  stageTo: null,
  suggest: null,
  ...changes,
});
const situation: Situation = {
  package: {
    id: "pkg",
    title: "Kedarnath Yatra 4N",
    place: "Kedarnath",
    destinationId: null,
    nights: 4,
    startCity: "Delhi",
    pickups: [],
    offered: ["triple"],
    adultRooms: ["triple"],
    departures: [],
  },
  price: {
    packageId: "pkg",
    roomType: null,
    fromPaise: 599_900,
    perPersonPaise: 599_900,
    totalPaise: null,
    advancePaise: null,
    advancePerPersonPaise: 200_000,
    rooms: [],
    travellers: null,
    departure: null,
  },
  looked: [],
};
const fromPrice = decision({ kind: "give_price", packageId: "pkg", price: "from", ask: "when" });
const code = codeWordsOf(fromPrice, situation, "english", "Sharma Holidays", today);
const askedWhen = { kind: "ok" as const, text: "When would you like to go?", filled: [], raw: [], refusals: [] };

describe("what act is handed", () => {
  it("cannot_answer hands over as unanswered", () => {
    const acting = actingOn(fromPrice, code, { kind: "cannot_answer", raw: [], refusals: [] });
    expect(acting).toMatchObject({ decision: { move: { kind: "hand_over", reason: "unanswered" } }, reply: null });
  });

  it("refused twice hands over as check_failed", () => {
    const acting = actingOn(fromPrice, code, { kind: "refused", code: "amount", raw: [], refusals: ["amount"] });
    expect(acting).toMatchObject({ decision: { move: { kind: "hand_over", reason: "check_failed" } }, reply: null });
  });

  it("no words from code or the model hands over as unanswered", () => {
    const agency = decision({ kind: "answer_agency", topic: "refunds", ask: null });
    expect(codeWordsOf(agency, situation, "english", "Sharma Holidays", today)).toBeNull();
    expect(actingOn(agency, null, null)).toMatchObject({
      decision: { move: { kind: "hand_over", reason: "unanswered" }, note: "handed_over" },
      reply: null,
    });
  });

  it("a not_run with no place in the facts hands over, and never throws", () => {
    const notRun = decision({ kind: "fixed", text: "not_run" }, { facts: facts({ notRun: [] }) });
    const words = codeWordsOf(notRun, situation, "english", "Sharma Holidays", today);
    expect(words).toBeNull();
    expect(actingOn(notRun, words, null)).toMatchObject({
      decision: { move: { kind: "hand_over", reason: "unanswered" } },
    });
    const named = decision({ kind: "fixed", text: "not_run" }, { facts: facts({ notRun: ["Ladakh"] }) });
    expect(codeWordsOf(named, situation, "english", "Sharma Holidays", today)?.text).toContain("Ladakh");
  });

  it("the model's failure keeps code's own words, else ends the turn", () => {
    expect(actingOn(fromPrice, code, { kind: "ended", outcome: "limit", raw: [] })).toEqual({
      decision: fromPrice,
      reply: code,
    });
    const greet = decision({ kind: "greet", packageIds: [] });
    expect(actingOn(greet, null, { kind: "ended", outcome: "limit", raw: [] })).toEqual({ ended: "limit" });
  });

  it("a written ask follows code's price, the price's span kept", () => {
    const acting = actingOn(fromPrice, code, askedWhen);
    if ("ended" in acting) throw new Error("expected words");
    expect(acting.decision).toBe(fromPrice);
    expect(acting.reply?.text).toBe(
      `Kedarnath Yatra 4N: from ${formatRupees(599_900)} per person.\n\nWhen would you like to go?`,
    );
    expect(acting.reply?.filled.length).toBeGreaterThan(0);
  });

  it("book, resend_payment, hand_over and silent carry no reply: act writes their fixed lines", () => {
    for (const move of [
      { kind: "book", packageId: "pkg", departureId: "dep" },
      { kind: "resend_payment" },
      { kind: "hand_over", reason: "discount" },
      { kind: "silent" },
    ] satisfies Move[]) {
      expect(actingOn(decision(move), null, null)).toEqual({ decision: decision(move), reply: null });
    }
  });

  it("a hand-over in place of a full price tells no price and moves the lead no further than Contacted", () => {
    const quoted = { departureId: "dep", totalPaise: 1_199_800, advancePaise: 400_000 };
    const full = decision(
      { kind: "give_price", packageId: "pkg", price: "full", ask: "pickup" },
      { stageTo: "quote_sent", note: "quoted", facts: facts({ quoted, asked: [{ item: "pickup", times: 1 }] }) },
    );
    const handed = handOverInstead(full, "check_failed", "write:amount");
    expect(handed).toMatchObject({
      move: { kind: "hand_over", reason: "check_failed" },
      why: "write:amount",
      note: "handed_over",
      stageTo: "contacted",
      facts: { quoted: null, asked: [], lastMove: "hand_over" },
    });
  });
});
