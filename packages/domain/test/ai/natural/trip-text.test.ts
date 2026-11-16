// A trip as the natural agent reads it: in full (spec 4.2) and as one index line, from a literal sheet.
import { describe, expect, it } from "vitest";
import { seatWords, tripIndexLine, tripInFull } from "../../../src/ai/natural/trips/trip-text.js";
import type { TripSheet } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-14");
const day = parseCalendarDate;

const bySeason = { priceFrom: "season", perPersonPaise: { triple: 949_900 } } as const;

const kedarkantha: TripSheet = {
  label: "T1",
  packageId: "kedarkantha",
  title: "Kedarkantha Trek",
  place: "Sankri, Uttarakhand",
  nights: 5,
  startCity: "Dehradun",
  summary: "A winter summit trek through pine forest.",
  highlights: ["Summit sunrise", "Camp by a frozen lake"],
  days: [
    { title: "Dehradun to Sankri", text: "Drive 220 km, 8 to 9 hours." },
    { title: "Sankri to Juda ka Talab", text: "A 4 km climb through pine forest." },
    { title: "Juda ka Talab to Kedarkantha base", text: "Camp in the snow." },
    { title: "Kedarkantha summit (3,800 m) and back", text: "Start at 3 am for the sunrise." },
    { title: "Sankri to Dehradun", text: "Reach Dehradun by 7 pm." },
  ],
  pickups: ["Dehradun ISBT, 6:30 am", "Dehradun railway station, 7 am"],
  inclusions: "Tents, meals on the trek and a certified trek leader.",
  exclusions: "Personal gear.",
  notes: "Carry warm layers.",
  cancellation: "50% back up to 15 days before.",
  rooms: ["triple"],
  seasons: [{ name: "Winter", from: day("2026-11-01"), until: day("2026-12-31"), perPersonPaise: { triple: 949_900 } }],
  pricesIncludeGst: true,
  taxRateBasisPoints: 500,
  fromPaise: 949_900,
  advancePerPersonPaise: 300_000,
  departures: [
    { id: "d12", startsOn: day("2026-12-12"), freeSeats: 20, ...bySeason },
    { id: "d19", startsOn: day("2026-12-19"), freeSeats: 4, ...bySeason },
    { id: "d26", startsOn: day("2026-12-26"), freeSeats: 12, ...bySeason },
  ],
  fileIds: ["brochure"],
};
const withNotes = (notes: string): TripSheet => ({ ...kedarkantha, notes });
const excludingGst: TripSheet = { ...kedarkantha, pricesIncludeGst: false };

describe("a trip as the natural agent reads it", () => {
  it("writes a trip in full with its numbers, rooms by season, advance and the next departures", () => {
    const text = tripInFull(kedarkantha, today);
    expect(text.split("\n")[0]).toBe("T1 Kedarkantha Trek · Sankri, Uttarakhand · 5 nights · from Dehradun");
    for (const part of [
      "triple ₹9,499 per person",
      "GST included",
      "advance ₹3,000 per person",
      "Sat 12 Dec: open",
      "Sat 19 Dec: 4 left",
      "Sat 26 Dec: open",
      "Day 4, Kedarkantha summit (3,800 m) and back: Start at 3 am for the sunrise.",
      "Dehradun ISBT, 6:30 am",
      "Tents, meals on the trek and a certified trek leader.",
      "50% back up to 15 days before.",
    ])
      expect(text).toContain(part);
  });

  it("writes each season's room prices on one line, with its days", () => {
    const text = tripInFull(
      {
        ...kedarkantha,
        rooms: ["double", "triple"],
        seasons: [
          {
            name: "Winter",
            from: day("2026-11-01"),
            until: day("2026-12-31"),
            perPersonPaise: { triple: 949_900, double: 1_099_900 },
          },
        ],
      },
      today,
    );
    expect(text).toContain("Winter (Sun 1 Nov–Thu 31 Dec): double ₹10,999, triple ₹9,499 per person");
  });

  it("gives a departure's own prices as replacing the season's, and says when nothing prices a date", () => {
    const text = tripInFull(
      {
        ...kedarkantha,
        departures: [
          {
            id: "d26",
            startsOn: day("2026-12-26"),
            freeSeats: 3,
            priceFrom: "departure",
            perPersonPaise: { triple: 1_199_900 },
          },
          { id: "d09", startsOn: day("2027-01-09"), freeSeats: 20, priceFrom: "none", perPersonPaise: {} },
        ],
      },
      today,
    );
    expect(text).toContain(
      "- Sat 26 Dec: 3 left; this date's own prices replace the season's: triple ₹11,999 per person",
    );
    expect(text).toContain("- Sat 9 Jan 2027: open; no price set for this date");
  });

  it("keeps numbers in the owner's text", () => {
    expect(tripInFull(withNotes("Pickup 6:30 am, summit at 3,800 m, 4 nights in tents"), today)).toContain(
      "Pickup 6:30 am, summit at 3,800 m, 4 nights in tents",
    );
  });

  it("says plus GST when prices exclude it", () => {
    expect(tripInFull(excludingGst, today)).toContain("plus 5% GST");
  });

  it("shows seats as open, or N left at 5 or fewer (a full departure is never listed)", () => {
    expect([seatWords(500), seatWords(6), seatWords(5), seatWords(1)]).toEqual(["open", "open", "5 left", "1 left"]);
  });

  it("writes one index line with the from-price, the next 3 dates and the main stops", () => {
    expect(tripIndexLine(kedarkantha, today)).toBe(
      "T1 Kedarkantha Trek · Sankri, Uttarakhand · 5 nights · from Dehradun · from ₹9,499 · Sat 12 Dec, Sat 19 Dec, Sat 26 Dec · stops: Sankri, Juda ka Talab, Kedarkantha summit",
    );
  });

  it("names at most 4 stops, each a day title's first place, and says when no date is open", () => {
    const longer: TripSheet = {
      ...kedarkantha,
      departures: [],
      days: ["Day 1: Har ki Dun", "Osla and back", "Seema", "Ruinsara Tal", "Taluka"].map((title) => ({
        title,
        text: "",
      })),
    };
    expect(tripIndexLine(longer, today)).toContain("no open dates · stops: Har ki Dun, Osla, Seema, Ruinsara Tal");
    expect(tripInFull(longer, today)).toContain("no open dates");
  });
});
