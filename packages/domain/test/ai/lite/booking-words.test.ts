// What a booking needs and says, shared by act's book and Try it: the refusals in act's order, and the same words.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { bookingPartsOf, bookingWords } from "../../../src/ai/lite/booking-words.js";
import { fixedText, holdUntilWords, travellersWords } from "../../../src/ai/lite/fixed-texts.js";
import type { Decision, Situation } from "../../../src/ai/lite/types.js";
import { formatRupees, formatShortDay, parseCalendarDate } from "../../../src/kernel/index.js";

const P1 = "0198f6c0-0000-7000-8000-000000000001";
const D1 = "0198f6c0-0000-7000-8000-0000000000d1";
const D2 = "0198f6c0-0000-7000-8000-0000000000d2";
const today = parseCalendarDate("2026-11-10");
const told = { departureId: D1, totalPaise: 1_399_800, advancePaise: 400_000 };
const facts = (over: Partial<LiteFacts> = {}): LiteFacts =>
  liteFacts.parse({
    agent: "lite",
    packageId: P1,
    departureId: D1,
    adults: 2,
    roomType: "double",
    quoted: told,
    ...over,
  });
const decision = (over: Partial<LiteFacts> = {}): Decision => ({
  move: { kind: "book", packageId: P1, departureId: D1 },
  stage: "quoted",
  why: "test",
  facts: facts(over),
  stopFollowUps: false,
  note: null,
  task: null,
  stageTo: null,
  suggest: null,
});
const departure = { id: D1, startsOn: parseCalendarDate("2026-11-14"), freeSeats: 12 };
const situation: Situation = {
  package: {
    id: P1,
    title: "Kedarnath Yatra 4N",
    place: "Kedarnath",
    destinationId: null,
    nights: 4,
    startCity: "Delhi",
    pickups: [],
    offered: ["double"],
    adultRooms: ["double"],
    departures: [departure],
  },
  price: {
    packageId: P1,
    roomType: "double",
    fromPaise: 699_900,
    perPersonPaise: 699_900,
    totalPaise: 1_399_800,
    advancePaise: 400_000,
    advancePerPersonPaise: 200_000,
    rooms: [{ roomType: "double", people: 2 }],
    travellers: 2,
    departure,
  },
  looked: [],
};
const target = { packageId: P1, departureId: D1 };
const ready = { paymentReady: true, sellable: true };

describe("a booking's parts and words", () => {
  it("takes the told quote's package, departure, rooms and party, and the advance as due", () => {
    expect(bookingPartsOf({ decision: decision(), situation, target, told, ...ready })).toEqual({
      pkg: { id: P1, title: "Kedarnath Yatra 4N" },
      departure,
      rooms: [{ roomType: "double", people: 2 }],
      travellers: 2,
      told,
      due: 400_000,
    });
    expect(
      bookingPartsOf({ decision: decision({ payInFull: true }), situation, target, told, ...ready }),
    ).toMatchObject({
      due: 1_399_800,
    });
  });

  it("refuses as act does, payment details first, then the package, then the quote and party", () => {
    const refused = (changes: Partial<Parameters<typeof bookingPartsOf>[0]>) =>
      bookingPartsOf({ decision: decision(), situation, target, told, ...ready, ...changes });
    expect(refused({ paymentReady: false, sellable: false })).toMatchObject({ refused: "PAYMENT_DETAILS_MISSING" });
    expect(refused({ sellable: false })).toMatchObject({ refused: "PACKAGE_NOT_SELLABLE" });
    expect(refused({ told: null })).toMatchObject({ refused: "AI_ACTION_REFUSED" });
    expect(refused({ target: { packageId: P1, departureId: D2 } })).toMatchObject({ refused: "AI_ACTION_REFUSED" });
    expect(refused({ decision: decision({ adults: null }) })).toMatchObject({ refused: "AI_ACTION_REFUSED" });
    expect(refused({ situation: { ...situation, price: null } })).toMatchObject({ refused: "AI_ACTION_REFUSED" });
  });

  it("words the hold and the amount due in the customer's language", () => {
    const parts = bookingPartsOf({ decision: decision(), situation, target, told, ...ready });
    if ("refused" in parts) throw new Error("expected a booking");
    const holdUntil = new Date("2026-11-12T06:30:00Z");
    const text = bookingWords(parts, facts(), { holdUntil, today, timeZone: "Asia/Kolkata" });
    const values = {
      travellers: travellersWords(2, 0, "english"),
      package: "Kedarnath Yatra 4N",
      date: formatShortDay(departure.startsOn, today),
      holdUntil: holdUntilWords(holdUntil, today, "Asia/Kolkata"),
      total: formatRupees(1_399_800),
    };
    expect(text).toBe(fixedText("book_payment", "english", { ...values, advance: formatRupees(400_000) }).text);
    const full = bookingWords(parts, facts({ payInFull: true }), { holdUntil, today, timeZone: "Asia/Kolkata" });
    expect(full).toBe(fixedText("book_payment_full", "english", values).text);
  });
});
