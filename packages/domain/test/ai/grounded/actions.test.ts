// What the writing model may do is decided by code: money actions need a customer who wants to book, a known open
// departure with seats, a priced split, an advance, a QR or text, a lead and a chat that isn't natural.
import { chatFacts, type ChatFacts, type ReadAnswer, type WriteAnswer } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { allowedActions, bookingPackage, chosenActions, type ActionContext } from "../../../src/ai/grounded/actions.js";
import type { Lookup, LookupPackage } from "../../../src/ai/grounded/lookup.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const day = parseCalendarDate;
const today = day("2026-11-06");

const spiti: LookupPackage = {
  id: "package-a",
  why: { kind: "chosen" },
  name: "Spiti batch",
  title: "Spiti in winter",
  kind: "group",
  destination: "Spiti",
  nights: 6,
  summary: "",
  highlights: [],
  inclusions: "",
  exclusions: "",
  dayTitles: [],
  startCity: "",
  pickupPoints: "",
  pricesIncludeGst: true,
  offered: ["double"],
  prices: { ...none, double: 699_900 },
  from: { ...none, double: 699_900 },
  fromPaise: 699_900,
  departures: [{ id: "d1", startsOn: day("2026-11-14"), freeSeats: 4 }],
  chosenDeparture: { id: "d1", startsOn: day("2026-11-14"), freeSeats: 4 },
  total: 2_799_600,
  advancePerPersonPaise: 500_000,
  hasPaymentQr: true,
  hasPaymentText: true,
  brochures: [{ id: "f1", fileName: "spiti.pdf" }],
};
const lookup = (changes: Partial<Lookup> = {}, ...packages: LookupPackage[]): Lookup => ({
  packages: packages.length === 0 ? [spiti] : packages,
  notRun: [],
  customTrips: false,
  today,
  travellers: 4,
  startsOn: day("2026-11-14"),
  ...changes,
});
const facts = (changes: Partial<ChatFacts> = {}): ChatFacts => ({
  ...chatFacts.parse({}),
  travellers: 4,
  startsOn: "2026-11-14",
  rooms: [{ roomType: "double", people: 4 }],
  ...changes,
});
const read = (changes: Partial<ReadAnswer> = {}): ReadAnswer => ({
  places: [],
  startsOn: null,
  rooms: [],
  travellers: null,
  budgetRupees: null,
  pickupCity: null,
  chosen: null,
  wants: "book",
  wantsEvidence: "book it",
  special: null,
  nearest: [],
  ...changes,
});
const context: ActionContext = {
  natural: false,
  hasLead: true,
  settings: { leadNotes: true, followUpTasks: true },
  latest: ["book it"],
};
const money = (allowed: ReturnType<typeof allowedActions>) => [allowed.sendPayment, allowed.requestBooking];

describe("allowedActions", () => {
  it("allows payment and booking when every condition holds", () => {
    expect(money(allowedActions(lookup(), facts(), read(), context))).toEqual([true, true]);
  });

  it("no payment before they say they want to book", () => {
    // "2 people", "double sharing" and a bare "yes" are read as anything but a wish to book.
    for (const wants of ["information", "price", "other", "brochure"] as const) {
      expect(money(allowedActions(lookup(), facts(), read({ wants }), context))).toEqual([false, false]);
    }
  });

  describe("booking needs a split, an open departure and a price", () => {
    const blocked = (name: string, allowed: ReturnType<typeof allowedActions>) => {
      it(name, () => {
        expect(money(allowed)).toEqual([false, false]);
      });
    };
    blocked(
      "the room split is unknown",
      allowedActions(lookup({}, { ...spiti, total: null }), facts(), read(), context),
    );
    blocked(
      "no departure is known",
      allowedActions(
        lookup({}, { ...spiti, chosenDeparture: null, departures: [] }),
        facts({ startsOn: null }),
        read(),
        context,
      ),
    );
    blocked(
      "the departure has fewer free seats than travellers",
      allowedActions(
        lookup({}, { ...spiti, chosenDeparture: { id: "d1", startsOn: day("2026-11-14"), freeSeats: 3 } }),
        facts(),
        read(),
        context,
      ),
    );
    blocked("no advance", allowedActions(lookup({}, { ...spiti, advancePerPersonPaise: 0 }), facts(), read(), context));
    blocked(
      "no advance is set",
      allowedActions(lookup({}, { ...spiti, advancePerPersonPaise: null }), facts(), read(), context),
    );
    blocked(
      "neither a QR nor a payment text",
      allowedActions(lookup({}, { ...spiti, hasPaymentQr: false, hasPaymentText: false }), facts(), read(), context),
    );
    blocked("the chat has no lead", allowedActions(lookup(), facts(), read(), { ...context, hasLead: false }));
    blocked(
      "two group packages and none chosen",
      allowedActions(
        lookup(
          {},
          { ...spiti, why: { kind: "place", words: "Spiti" } },
          { ...spiti, id: "b", why: { kind: "place", words: "Kinnaur" } },
        ),
        facts(),
        read(),
        context,
      ),
    );
    blocked(
      "the only package is a custom trip",
      allowedActions(
        lookup({}, { ...spiti, kind: "custom", departures: [], chosenDeparture: null }),
        facts(),
        read(),
        context,
      ),
    );
    it("a QR alone, or a payment text alone, is enough", () => {
      expect(money(allowedActions(lookup({}, { ...spiti, hasPaymentQr: false }), facts(), read(), context))).toEqual([
        true,
        true,
      ]);
      expect(money(allowedActions(lookup({}, { ...spiti, hasPaymentText: false }), facts(), read(), context))).toEqual([
        true,
        true,
      ]);
    });
    it("the known departure is the one the lookup priced, and a different departureId blocks money", () => {
      const b = { id: "d2", startsOn: day("2026-12-01"), freeSeats: 8 };
      const pkg = { ...spiti, chosenDeparture: b, departures: [...spiti.departures, b] };
      const atB = { startsOn: "2026-12-01" as const };
      expect(money(allowedActions(lookup({}, pkg), facts({ ...atB, departureId: "d1" }), read(), context))).toEqual([
        false,
        false,
      ]);
      expect(money(allowedActions(lookup({}, pkg), facts({ ...atB, departureId: "gone" }), read(), context))).toEqual([
        false,
        false,
      ]);
      expect(money(allowedActions(lookup({}, pkg), facts({ ...atB, departureId: "d2" }), read(), context))).toEqual([
        true,
        true,
      ]);
      expect(money(allowedActions(lookup({}, pkg), facts({ ...atB, departureId: null }), read(), context))).toEqual([
        true,
        true,
      ]);
    });
    it("a chosen custom trip is never booked as the only group package in play", () => {
      // Kashmir (custom) chosen, Manali named earlier: "book it" must not send Manali's QR.
      const kashmir: LookupPackage = {
        ...spiti,
        id: "kashmir",
        kind: "custom",
        departures: [],
        chosenDeparture: null,
        why: { kind: "chosen" },
      };
      const manali: LookupPackage = { ...spiti, id: "manali", why: { kind: "place", words: "Manali" } };
      expect(bookingPackage(lookup({}, kashmir, manali))).toBeNull();
      expect(money(allowedActions(lookup({}, kashmir, manali), facts(), read(), context))).toEqual([false, false]);
      expect(bookingPackage(lookup({}, { ...manali, why: { kind: "chosen" } }))?.id).toBe("manali");
      expect(bookingPackage(lookup({}, manali))?.id).toBe("manali");
    });

    it("a chosen package wins over a second group package in the lookup", () => {
      const second = {
        ...spiti,
        id: "b",
        why: { kind: "place", words: "Kinnaur" } as const,
        hasPaymentQr: false,
        hasPaymentText: false,
      };
      expect(money(allowedActions(lookup({}, spiti, second), facts(), read(), context))).toEqual([true, true]);
    });
  });

  it("a price only the team can give, asked this turn, moves no money this turn", () => {
    const special = { kind: "discount" as const, evidence: "any discount" };
    const now = { ...context, latest: ["any discount? book it"] };
    expect(money(allowedActions(lookup(), facts(), read({ special }), now))).toEqual([false, false]);
    // Asked in an earlier message and flagged then: today's "book it" may go ahead.
    expect(money(allowedActions(lookup(), facts(), read({ special }), context))).toEqual([true, true]);
  });

  it("natural chats never get payment or booking", () => {
    const allowed = allowedActions(lookup(), facts(), read(), { ...context, natural: true });
    expect(money(allowed)).toEqual([false, false]);
  });

  it("a second payment for the same departure isn't allowed", () => {
    expect(money(allowedActions(lookup(), facts({ paymentSentFor: "d1" }), read(), context))).toEqual([false, false]);
    expect(money(allowedActions(lookup(), facts({ paymentSentFor: "d0" }), read(), context))).toEqual([true, true]);
  });

  it("sends files only for a package with unsent ones, when they want a brochure, information or a price", () => {
    const second = { ...spiti, id: "b", brochures: [] };
    for (const wants of ["brochure", "information", "price"] as const) {
      expect(allowedActions(lookup({}, spiti, second), facts(), read({ wants }), context).sendFiles).toEqual(["P1"]);
    }
    expect(allowedActions(lookup(), facts(), read({ wants: "book" }), context).sendFiles).toEqual([]);
    expect(allowedActions(lookup(), facts(), read({ wants: "other" }), context).sendFiles).toEqual([]);
  });

  it("never sends a suggested package's files for a place the agency doesn't run", () => {
    // Meghalaya asked, Spiti only suggested: the Spiti PDF waits until they pick it (the audit's incident).
    const suggested: LookupPackage = { ...spiti, why: { kind: "nearest", words: ["Meghalaya"] } };
    const place: LookupPackage = { ...spiti, id: "b", why: { kind: "place", words: "Manali" } };
    const allowed = allowedActions(lookup({}, suggested, place), facts(), read({ wants: "brochure" }), context);
    expect(allowed.sendFiles).toEqual(["P2"]);
  });

  it("sends the agency's files only when they want to know about the agency", () => {
    expect(allowedActions(lookup(), facts(), read({ wants: "about_agency" }), context).sendAgencyFiles).toBe(true);
    expect(allowedActions(lookup(), facts(), read({ wants: "price" }), context).sendAgencyFiles).toBe(false);
  });

  it("always allows a flag and a hand-over, and follows the settings for notes and tasks", () => {
    const off = { ...context, settings: { leadNotes: false, followUpTasks: false } };
    const allowed = allowedActions(lookup(), facts(), read({ wants: "other" }), off);
    expect([allowed.flag, allowed.handOver, allowed.note, allowed.task]).toEqual([true, true, false, false]);
    const on = allowedActions(lookup(), facts(), read({ wants: "other" }), context);
    expect([on.note, on.task]).toEqual([true, true]);
  });

  it("a place not run, or a discount ask, is flagged by code", () => {
    const notRun = { destination: "none", words: "Meghalaya", evidence: "Meghalaya" };
    expect(allowedActions(lookup(), facts(), read({ places: [notRun] }), context).forcedFlag).toBe("not_run");
    const special = { kind: "discount" as const, evidence: "any discount" };
    expect(allowedActions(lookup(), facts(), read({ special }), context).forcedFlag).toBe("special_price");
    expect(allowedActions(lookup(), facts(), read({ places: [notRun], special }), context).forcedFlag).toBe(
      "not_run,special_price",
    );
    expect(allowedActions(lookup(), facts(), read(), context).forcedFlag).toBeNull();
    // A place not run in an earlier turn is not this turn's.
    expect(
      allowedActions(lookup({ notRun: ["Meghalaya"] }), facts({ notRun: ["Meghalaya"] }), read(), context).forcedFlag,
    ).toBeNull();
  });
});

const asked = (changes: Partial<WriteAnswer["actions"]> = {}): WriteAnswer["actions"] => ({
  sendFiles: [],
  sendAgencyFiles: false,
  sendPayment: false,
  requestBooking: false,
  flag: null,
  handOver: null,
  note: null,
  task: null,
  ...changes,
});

describe("chosenActions", () => {
  const closed = allowedActions(lookup(), facts(), read({ wants: "information" }), context);

  it("actions not allowed are dropped", () => {
    const task = { title: "Call back", dueInHours: 4 };
    const chosen = chosenActions(
      asked({
        sendFiles: ["P1", "P9"],
        sendAgencyFiles: true,
        sendPayment: true,
        requestBooking: true,
        note: "n",
        task,
      }),
      allowedActions(lookup(), facts(), read({ wants: "information" }), {
        ...context,
        settings: { leadNotes: false, followUpTasks: false },
      }),
    );
    expect(chosen).toEqual({
      sendFiles: ["P1"],
      sendAgencyFiles: false,
      sendPayment: false,
      requestBooking: false,
      flag: null,
      handOver: null,
      note: null,
      task: null,
    });
    expect(closed.sendPayment).toBe(false);
  });

  it("keeps an allowed money action and lets a flag and a hand-over through", () => {
    const open = allowedActions(lookup(), facts(), read(), context);
    const chosen = chosenActions(
      asked({ sendPayment: true, requestBooking: true, flag: "odd", handOver: "angry" }),
      open,
    );
    expect([chosen.sendPayment, chosen.requestBooking, chosen.flag, chosen.handOver]).toEqual([
      true,
      true,
      "odd",
      "angry",
    ]);
  });

  it("book is one action: either one asked, with money allowed, does both; without it, neither", () => {
    const open = allowedActions(lookup(), facts(), read(), context);
    for (const one of [{ sendPayment: true }, { requestBooking: true }]) {
      const chosen = chosenActions(asked(one), open);
      expect([chosen.sendPayment, chosen.requestBooking]).toEqual([true, true]);
    }
    const shut = chosenActions(asked({ sendPayment: true, requestBooking: true }), closed);
    expect([shut.sendPayment, shut.requestBooking]).toEqual([false, false]);
    const neither = chosenActions(asked(), open);
    expect([neither.sendPayment, neither.requestBooking]).toEqual([false, false]);
  });

  it("flags once, with the code's reason first, whatever the model chose", () => {
    const forced = allowedActions(
      lookup(),
      facts(),
      read({ places: [{ destination: "none", words: "Goa", evidence: "Goa" }] }),
      context,
    );
    expect(chosenActions(asked(), forced).flag).toBe("not_run");
    const both = allowedActions(
      lookup(),
      facts(),
      read({
        places: [{ destination: "none", words: "Goa", evidence: "Goa" }],
        special: { kind: "discount", evidence: "discount" },
      }),
      context,
    );
    expect(chosenActions(asked({ flag: "angry" }), both).flag).toBe("not_run,special_price: angry");
    expect(chosenActions(asked({ flag: "wants_call" }), forced).flag).toBe("not_run: wants_call");
  });
});
