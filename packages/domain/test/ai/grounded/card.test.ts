// The card a model writes from, and the filling of its placeholders by code: values live beside the text, never in it.
import { describe, expect, it } from "vitest";
import { buildCard } from "../../../src/ai/grounded/card.js";
import { fillPlaceholders } from "../../../src/ai/grounded/fill.js";
import type { Lookup, LookupPackage } from "../../../src/ai/grounded/lookup.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const day = parseCalendarDate;
const today = day("2026-11-06");

const spiti: LookupPackage = {
  id: "package-a",
  why: { kind: "place", words: "Spiti" },
  name: "Spiti batch",
  title: "Spiti in winter",
  kind: "group",
  destination: "Spiti",
  nights: 6,
  summary: "Seven days over the passes.",
  highlights: ["Key monastery", "Chandratal"],
  inclusions: "Stay and breakfast",
  exclusions: "Flights",
  dayTitles: ["Arrive in Manali", "Drive to Kaza"],
  startCity: "Chandigarh",
  pickupPoints: "Chandigarh ISBT, call +91 98765 43210",
  pricesIncludeGst: true,
  offered: ["double", "triple"],
  prices: { ...none, double: 699_900, triple: 599_900 },
  from: { ...none, double: 699_900, triple: 599_900 },
  fromPaise: 599_900,
  departures: [
    { id: "d1", startsOn: day("2026-11-14"), freeSeats: 4 },
    { id: "d2", startsOn: day("2027-01-02"), freeSeats: 9 },
  ],
  chosenDeparture: { id: "d1", startsOn: day("2026-11-14"), freeSeats: 4 },
  total: 3_499_600,
  advancePerPersonPaise: 500_000,
  hasPaymentQr: true,
  hasPaymentText: true,
  brochures: [],
};
const lookup = (...packages: LookupPackage[]): Lookup => ({
  packages,
  notRun: [],
  customTrips: false,
  today,
  travellers: 5,
  startsOn: day("2026-11-14"),
});

describe("the card", () => {
  it("keys packages P1..Pn and keeps every value out of the text", () => {
    const card = buildCard(lookup(spiti, { ...spiti, id: "package-b", title: "Kinnaur" }));
    expect(card.text).toContain("P1");
    expect(card.text).toContain("P2");
    expect(card.text).toContain("Spiti in winter");
    expect(card.text).toContain("Drive to Kaza");
    expect(card.text).toContain("Chandigarh");
    for (const placeholder of ["[price P1 double]", "[total P1]", "[departure P1 2]", "[seats P1 1]", "[pickup P1]"]) {
      expect(card.text).toContain(placeholder);
    }
    expect(card.text).not.toContain("[departure P1 3]");
    for (const value of card.values.values()) expect(card.text).not.toContain(value);
    expect(card.text).not.toContain("98765");
    expect(card.values.get("[price P2 double]")).toBe("₹6,999");
  });

  it("offers a placeholder only when it has a value", () => {
    const card = buildCard(
      lookup({
        ...spiti,
        prices: null,
        total: null,
        chosenDeparture: null,
        pickupPoints: "",
        advancePerPersonPaise: null,
      }),
    );
    for (const missing of ["[price P1", "[total P1", "[departure P1]", "[pickup P1", "[advance P1"]) {
      expect(card.text).not.toContain(missing);
    }
    expect(card.text).toContain("[from P1 double]");
  });
});

describe("filling placeholders", () => {
  const card = buildCard(lookup(spiti));

  it("placeholders fill with ₹6,999 and Sat 14 Nov, and an unknown one is reported", () => {
    const text =
      "Double is [price P1 double] a head, leaving [departure P1] ([seats P1 1] seats). Also [price P9 double].";
    const filled = fillPlaceholders(text, card);
    expect(filled.text).toBe("Double is ₹6,999 a head, leaving Sat 14 Nov (4 seats). Also [price P9 double].");
    expect(filled.unknown).toEqual(["[price P9 double]"]);
    expect(filled.filled.map(({ start, end }) => filled.text.slice(start, end))).toEqual(["₹6,999", "Sat 14 Nov", "4"]);
  });

  it("fills totals, advances and the year of a day in another year", () => {
    const filled = fillPlaceholders(
      "[total P1], [advance P1] each, [advance total P1] now, then [departure P1 2].",
      card,
    );
    expect(filled.text).toBe("₹34,996, ₹5,000 each, ₹25,000 now, then Sat 2 Jan 2027.");
    expect(filled.unknown).toEqual([]);
  });

  it("leaves ordinary brackets alone and reads capital letters leniently", () => {
    const filled = fillPlaceholders("Day [3] of 5N6D, [Price P1 Double]", card);
    expect(filled.text).toBe("Day [3] of 5N6D, ₹6,999");
    expect(filled.unknown).toEqual([]);
  });

  it("keys are case-insensitive: a lowercase p fills, an unknown one is reported", () => {
    const filled = fillPlaceholders("[price p1 double] and [price p7 double]", card);
    expect(filled.text).toBe("₹6,999 and [price p7 double]");
    expect(filled.unknown).toEqual(["[price p7 double]"]);
  });

  it("writes a package's free text without the amounts and dates the agency typed into it", () => {
    const stale: LookupPackage = {
      ...spiti,
      title: "Spiti 5N6D just Rs 18,500",
      summary: "Leaves 14 Nov 2026. Seven days over the passes.",
      highlights: ["Key monastery from ₹9,999"],
      inclusions: "Stay at 4,500 ft, breakfast",
      exclusions: "Flights, GST 5%",
      dayTitles: ["Day 3 Kaza on 16 Nov"],
    };
    const text = buildCard(lookup(stale)).text;
    for (const gone of ["18,500", "14 Nov", "9,999", "16 Nov"]) expect(text).not.toContain(gone);
    for (const kept of ["Spiti 5N6D", "Seven days over the passes", "Key monastery", "4,500 ft", "Day 3 Kaza"])
      expect(text).toContain(kept);
  });
});
