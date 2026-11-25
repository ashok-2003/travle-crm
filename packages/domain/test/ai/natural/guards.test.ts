// The trace's flags on the agent's words, which are not checks: a date or a seat count the agency's data doesn't hold
// (bench agency T, as literal sheets).
import { describe, expect, it } from "vitest";
import { traceFlags } from "../../../src/ai/natural/guards/check-words.js";
import type { TripSheet } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-15");
const day = parseCalendarDate;

const bySeason = (price: number) => ({ priceFrom: "season", perPersonPaise: { triple: price } }) as const;

const kedarkantha: TripSheet = {
  label: "T1",
  packageId: "kedarkantha",
  title: "Kedarkantha Trek",
  place: "Sankri, Uttarakhand",
  destinationId: null,
  nights: 5,
  startCity: "Dehradun",
  summary: "Kedarkantha Trek: a winter trek with snow camps.",
  highlights: ["Summit sunrise", "Snow camps"],
  days: [
    { title: "Dehradun to Sankri", text: "Drive 220 km, 8 to 9 hours." },
    { title: "Kedarkantha summit (3,800 m) and back", text: "Start at 3 am for the sunrise." },
  ],
  pickups: ["Dehradun ISBT, 6:30 am"],
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
  departures: ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"].map((startsOn) => ({
    id: `kk-${startsOn}`,
    startsOn: day(startsOn),
    freeSeats: 20,
    ...bySeason(949_900),
  })),
  fileIds: ["brochure"],
  brochures: [],
  photoIds: [],
};

describe("trace flags, which are not checks", () => {
  const flagContext = { sheets: [kedarkantha], ownerText: "", customerText: "", today };

  it("flags a date found in no departure, owner text or customer line, and a seat count the data doesn't hold", () => {
    expect(traceFlags("13 Dec ko 3 seats bachi hain", flagContext)).toEqual([
      "date_not_in_data:2026-12-13",
      "seats_differ:T1",
    ]);
  });

  it("does not know the last day of a season with no end", () => {
    const open: TripSheet = {
      ...kedarkantha,
      seasons: [
        {
          name: "Winter",
          from: parseCalendarDate("2026-11-01"),
          until: parseCalendarDate("2099-12-31"),
          perPersonPaise: { triple: 1 },
        },
      ],
    };
    expect(traceFlags("Prices hold till 31/12/2099", { ...flagContext, sheets: [open] })).toEqual([
      "date_not_in_data:2099-12-31",
    ]);
  });

  it("flags nothing the data, the owner or the customer holds", () => {
    const fewSeats: TripSheet = {
      ...kedarkantha,
      departures: kedarkantha.departures.map((one) => (one.startsOn === "2026-12-19" ? { ...one, freeSeats: 3 } : one)),
    };
    const context = {
      ...flagContext,
      sheets: [fewSeats],
      ownerText: "Christmas camp on 24 Dec",
      customerText: "2 Jan?",
    };
    expect(traceFlags("19 Dec ko 3 seats bachi hain. 24 Dec camp, 2 Jan nahi.", context)).toEqual([]);
  });
});
