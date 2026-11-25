// Grounding the AI's proposed trip changes: every price and date must be printed in a line it cites (a date's year is
// the line's, else code's), a line under another trip's nights is flagged, past dates and bookings are flagged, a removal
// the lines don't name is flagged, and a change the member may not make is flagged not_allowed. Values are built by code
// from what the lines print, never taken from the model's own figures.
import type { PackageChange } from "@travel-crm/contracts/ai";
import { noRoomPrices as none } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { parseChangesAnswer } from "../../../src/ai/package-changes/answer.js";
import { groundChanges, type ChangeRights } from "../../../src/ai/package-changes/ground.js";
import { buildSnapshot } from "../../../src/ai/package-changes/trip-snapshot.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-25");
const everything: ChangeRights = { addDepartures: true, editDepartures: true, selling: true };

const departure = (
  id: string,
  startDate: string,
  extra: Partial<Parameters<typeof buildSnapshot>[0]["departures"][number]> = {},
) => ({
  id,
  startDate,
  status: "open" as const,
  seatsTotal: 40,
  seatsSold: 0,
  seatsHeld: 0,
  prices: { ...none, double: 699_900, triple: 599_900 },
  ownPrices: none,
  scheduledOn: null,
  ...extra,
});

const snapshot = buildSnapshot({
  from: today,
  trip: {
    id: "0193a000-0000-7000-8000-000000000001",
    name: "Hill town 4N/5D",
    kind: "group",
    nights: 4,
    roomTypes: ["double", "triple"],
    seatsPerDeparture: 40,
    advancePerPersonPaise: 200_000,
    weeklyDays: [5],
    departureMonths: [11, 12, 1],
    pickupPoints: "Delhi ISBT at 6 pm",
    startCity: "Delhi",
    inclusions: "Hotel, breakfast",
    exclusions: "Lunch",
    cancellationNotes: "",
    notes: "Carry warm clothes\nNo refunds after departure",
    days: [{ title: "Day 1: Delhi to the hills", description: "Overnight Volvo" }],
    aiSellable: false,
  },
  seasons: [
    {
      id: "0193a000-0000-7000-8000-0000000000a1",
      label: "Regular",
      startsOn: "2026-01-01",
      endsOn: "2099-12-31",
      prices: { ...none, double: 699_900, triple: 599_900 },
    },
  ],
  departures: [
    departure("0193a000-0000-7000-8000-0000000000d1", "2026-12-04", { seatsSold: 8 }),
    departure("0193a000-0000-7000-8000-0000000000d2", "2026-12-11", { status: "cancelled" }),
    departure("0193a000-0000-7000-8000-0000000000d3", "2026-11-20", { status: "cancelled" }),
    departure("0193a000-0000-7000-8000-0000000000d4", "2026-11-22"),
    departure("0193a000-0000-7000-8000-0000000000d5", "2026-12-18", {
      prices: { ...none, double: 949_900, triple: 599_900 },
      ownPrices: { ...none, double: 949_900 },
    }),
  ],
});

/** The model's answer as JSON text would give it, grounded against the lines code numbered. */
function ground(
  changes: unknown[],
  lines: Record<string, string>,
  rights: ChangeRights = everything,
  photos: { count: number; lines: { ref: string; text: string }[] } = { count: 0, lines: [] },
) {
  const answer = parseChangesAnswer({ changes, photoLines: photos.lines });
  if (answer === null) throw new Error("The answer did not parse");
  return groundChanges(answer, {
    snapshot,
    lines: new Map(Object.entries(lines)),
    photoCount: photos.count,
    today,
    rights,
  });
}

/** A season price change on the regular column, cited from the given lines. */
const priceChange = (lines: string[], printed = "8,499") => ({
  kind: "season_change",
  season: "S1",
  label: null,
  prices: [{ room: "double", printed }],
  lines,
});

const only = (changes: PackageChange[]): PackageChange => {
  expect(changes).toHaveLength(1);
  const [change] = changes;
  if (change === undefined) throw new Error("No change");
  return change;
};

describe("grounding the proposed changes", () => {
  it("passes a season price printed in the cited line, built from the printed figure", () => {
    const change = only(
      ground(
        [
          {
            kind: "season_add",
            label: "Christmas",
            from: "18 Dec",
            to: "1 Jan",
            // The model's own figure is ignored: code reads the printed price.
            prices: [{ room: "double", printed: "7,999", paise: 1 }],
            lines: ["L1"],
          },
        ],
        { L1: "Christmas 18 Dec to 1 Jan double 7999 per person" },
      ),
    );
    expect(change).toMatchObject({
      kind: "season_add",
      label: "Christmas",
      startsOn: "2026-12-18",
      endsOn: "2027-01-01",
      prices: { ...none, double: 799_900 },
      flags: [],
      evidence: [{ ref: "L1", text: "Christmas 18 Dec to 1 Jan double 7999 per person", kind: "message" }],
    });
  });

  it("flags a season price the cited line doesn't print", () => {
    const change = only(
      ground(
        [
          {
            kind: "season_add",
            label: "Christmas",
            from: "18 Dec",
            to: null,
            prices: [{ room: "double", printed: "7,999" }],
            lines: ["L1"],
          },
        ],
        { L1: "Christmas rates from 18 Dec, double 7499" },
      ),
    );
    expect(change.flags).toEqual(["not_in_message"]);
    expect(change).toMatchObject({ endsOn: null });
  });

  it("passes a date printed as 18 Dec or 18/12, and flags one the line doesn't print", () => {
    const season = (from: string, line: string) =>
      only(
        ground(
          [
            {
              kind: "season_add",
              label: "Peak",
              from,
              to: null,
              prices: [{ room: "double", printed: "7999" }],
              lines: ["L1"],
            },
          ],
          { L1: line },
        ),
      );
    expect(season("18 Dec", "From 18 Dec new rate 7999").flags).toEqual([]);
    expect(season("18 Dec", "18/12 se naya rate 7999")).toMatchObject({ startsOn: "2026-12-18", flags: [] });
    expect(season("18 Dec", "From 20 Dec new rate 7999").flags).toEqual(["not_in_message"]);
  });

  it("flags a change cited from a line about another trip's nights", () => {
    const change = only(
      ground(
        [
          {
            kind: "season_change",
            season: "S1",
            label: null,
            prices: [{ room: "double", printed: "8,499" }],
            lines: ["L2"],
          },
        ],
        { L1: "Hill town 4N/5D double 6999", L2: "Hill town 5N/6D double 8499" },
      ),
    );
    expect(change).toMatchObject({
      kind: "season_change",
      seasonIds: ["0193a000-0000-7000-8000-0000000000a1"],
      prices: { ...none, double: 849_900, triple: 599_900 },
      before: { label: "Regular", prices: { ...none, double: 699_900, triple: 599_900 } },
    });
    expect(change.flags).toEqual(["other_trip"]);
  });

  it("flags reopening or cancelling a past departure", () => {
    const changes = ground(
      [
        { kind: "departure_reopen", departure: "D3", lines: ["L1"] },
        { kind: "departure_cancel", departure: "D4", reason: "Road closed", lines: ["L2"] },
      ],
      { L1: "20 Nov batch is back on", L2: "22 Nov cancelled, road closed" },
    );
    expect(changes.map((change) => [change.kind, change.flags])).toEqual([
      ["departure_reopen", ["past_date"]],
      ["departure_cancel", ["past_date"]],
    ]);
  });

  it("flags cancelling a departure that has bookings, still offering it", () => {
    const change = only(
      ground([{ kind: "departure_cancel", departure: "D1", reason: "Snow", lines: ["L1"] }], {
        L1: "4 Dec departure cancelled due to snow",
      }),
    );
    expect(change).toMatchObject({
      kind: "departure_cancel",
      departureId: "0193a000-0000-7000-8000-0000000000d1",
      startDate: "2026-12-04",
      reason: "Snow",
      flags: ["has_bookings"],
    });
  });

  it("flags a change the member may not make", () => {
    const answer = [
      { kind: "departures_add", dates: ["26 Dec"], weekly: null, lines: ["L1"] },
      { kind: "departure_cancel", departure: "D1", reason: "Snow", lines: ["L2"] },
      { kind: "ai_selling", on: true, lines: ["L3"] },
    ];
    const lines = { L1: "New departure 26 Dec", L2: "4 Dec cancelled", L3: "Start selling it" };
    const flagsOf = (rights: ChangeRights) =>
      ground(answer, lines, rights).map((change) => change.flags.includes("not_allowed"));
    expect(flagsOf(everything)).toEqual([false, false, false]);
    expect(flagsOf({ ...everything, addDepartures: false })).toEqual([true, false, false]);
    expect(flagsOf({ ...everything, editDepartures: false })).toEqual([false, true, false]);
    expect(flagsOf({ ...everything, selling: false })).toEqual([false, false, true]);
  });

  it("expands a weekly rule into the dates ahead, drops days that depart, and reopens a cancelled one", () => {
    const changes = ground(
      [
        {
          kind: "departures_add",
          dates: [],
          weekly: { days: ["Friday"], from: "1 Dec", to: "25 Dec" },
          lines: ["L1"],
        },
      ],
      { L1: "Every Friday from 1 Dec to 25 Dec" },
    );
    // 4 Dec and 18 Dec already depart; 11 Dec holds a cancelled one, which is reopened rather than added again.
    expect(changes.map(({ evidence, ...change }) => [evidence.length, change])).toEqual([
      [1, { id: "c1", kind: "departures_add", dates: ["2026-12-25"], flags: [] }],
      [
        1,
        {
          id: "c2",
          kind: "departure_reopen",
          departureId: "0193a000-0000-7000-8000-0000000000d2",
          startDate: "2026-12-11",
          flags: [],
        },
      ],
    ]);
  });

  it("keeps note lines, seats and the advance only when the lines back them", () => {
    const changes = ground(
      [
        { kind: "note_add", line: "Carry ID proof", lines: ["L1"] },
        { kind: "note_remove", note: "N1", lines: ["L2"] },
        { kind: "departure_seats", departure: "D1", seats: 30, lines: ["L3"] },
        { kind: "trip_field", field: "advancePerPersonPaise", value: "3,000", lines: ["L4"] },
        { kind: "trip_field", field: "seatsPerDeparture", value: 35, lines: ["L4"] },
      ],
      {
        L1: "Carry ID proof",
        L2: "No need of warm clothes now",
        L3: "4 Dec batch only 30 seats",
        L4: "Advance 3000 per head",
      },
    );
    expect(changes.map((change) => [change.kind, change.flags])).toEqual([
      ["note_add", []],
      ["note_remove", []],
      ["departure_seats", []],
      ["trip_field", []],
      ["trip_field", ["not_in_message"]],
    ]);
    expect(changes[1]).toMatchObject({ line: "Carry warm clothes" });
    expect(changes[2]).toMatchObject({ before: 40, seatsTotal: 30 });
    expect(changes[3]).toMatchObject({ field: "advancePerPersonPaise", before: 200_000, value: 300_000 });
  });

  it("drops changes that name nothing real or change nothing", () => {
    expect(
      ground(
        [
          { kind: "departure_cancel", departure: "D9", reason: "", lines: ["L1"] },
          { kind: "note_remove", note: "N7", lines: ["L1"] },
          { kind: "ai_selling", on: false, lines: ["L1"] },
          { kind: "departure_reopen", departure: "D1", lines: ["L1"] },
        ],
        { L1: "4 Dec" },
      ),
    ).toEqual([]);
  });
  it("takes a date's year from the cited line, else works it out, never from the AI", () => {
    const season = (from: string, to: string | null, line: string) =>
      only(
        ground(
          [
            {
              kind: "season_add",
              label: "Peak",
              from,
              to,
              prices: [{ room: "double", printed: "7999" }],
              lines: ["L1"],
            },
          ],
          { L1: line },
        ),
      );
    expect(season("18 Dec", "1 Jan", "Christmas 18 Dec 2027 to 1 Jan 2028 double 7999")).toMatchObject({
      startsOn: "2027-12-18",
      endsOn: "2028-01-01",
      flags: [],
    });
    expect(season("18 Dec 2027", null, "From 18 Dec new rate 7999")).toMatchObject({
      startsOn: "2026-12-18",
      flags: [],
    });
  });

  it("reads nights in either order, and the heading above a cited line", () => {
    const flagsOf = (lines: Record<string, string>, cited: string[]) => only(ground([priceChange(cited)], lines)).flags;
    expect(flagsOf({ L1: "Hill town 6D/5N double 8499" }, ["L1"])).toEqual(["other_trip"]);
    expect(flagsOf({ L1: "Hill town 5D/4N double 8499" }, ["L1"])).toEqual([]);
    expect(flagsOf({ L1: "Hill town 5N/6D", L2: "Double 8499" }, ["L2"])).toEqual(["other_trip"]);
    expect(flagsOf({ L1: "Spiti 6N/7D", L2: "Hill town 4N/5D", L3: "Double 8499" }, ["L3"])).toEqual([]);
  });

  it("never reads a group size or a trip's length as a date", () => {
    const flagsOf = (line: string) =>
      only(ground([{ kind: "departures_add", dates: ["10 Dec"], weekly: null, lines: ["L1"] }], { L1: line })).flags;
    expect(flagsOf("New departure 10/12")).toEqual([]);
    expect(flagsOf("New departure, 10-12 pax")).toEqual(["not_in_message"]);
    expect(flagsOf("New departure, 10/12 sharing")).toEqual(["not_in_message"]);
    expect(flagsOf("New departure, 10-12 days")).toEqual(["not_in_message"]);
  });

  it("flags a removal the cited lines don't name, and drops an empty itinerary", () => {
    const notSold = (line: string) =>
      only(
        ground(
          [
            {
              kind: "season_change",
              season: "S1",
              label: null,
              prices: [
                { room: "double", printed: "6,499" },
                { room: "triple", printed: null },
              ],
              lines: ["L1"],
            },
          ],
          { L1: line },
        ),
      );
    expect(notSold("Double 6499").flags).toEqual(["not_in_message"]);
    expect(notSold("Double 6499, triple not available")).toMatchObject({
      prices: { ...none, double: 649_900 },
      flags: [],
    });
    const field = (field: string, value: unknown, line: string) =>
      ground([{ kind: "trip_field", field, value, lines: ["L1"] }], { L1: line }).map((change) => change.flags);
    expect(field("departureMonths", [], "Repeats change")).toEqual([["not_in_message"]]);
    expect(field("departureMonths", [], "Departures every month now")).toEqual([[]]);
    expect(field("weeklyDays", [], "Stop the repeats")).toEqual([["not_in_message"]]);
    expect(field("weeklyDays", [], "No more Friday departures")).toEqual([[]]);
    expect(field("exclusions", "", "Exclusions change")).toEqual([["not_in_message"]]);
    expect(ground([{ kind: "itinerary", days: [], lines: ["L1"] }], { L1: "Itinerary" })).toEqual([]);
  });

  it("prices a departure from its own prices when it has some, and drops one that changes nothing", () => {
    const own = only(
      ground(
        [{ kind: "departure_prices", departure: "D5", prices: [{ room: "double", printed: "9,999" }], lines: ["L1"] }],
        {
          L1: "18 Dec batch double 9999",
        },
      ),
    );
    expect(own).toMatchObject({
      before: { ...none, double: 949_900 },
      prices: { ...none, double: 999_900 },
      flags: [],
    });
    expect(
      ground(
        [{ kind: "departure_prices", departure: "D1", prices: [{ room: "double", printed: "6,999" }], lines: ["L1"] }],
        {
          L1: "4 Dec batch double 6999",
        },
      ),
    ).toEqual([]);
  });

  it("keeps the last itinerary and AI switch change, and at most 60 changes", () => {
    const changes = ground(
      [
        { kind: "itinerary", days: [{ title: "Old plan", description: "" }], lines: ["L1"] },
        { kind: "ai_selling", on: true, lines: ["L1"] },
        { kind: "itinerary", days: [{ title: "New plan", description: "" }], lines: ["L1"] },
        { kind: "ai_selling", on: true, lines: ["L1"] },
      ],
      { L1: "New plan, and sell it" },
    );
    expect(changes.map((change) => change.kind)).toEqual(["itinerary", "ai_selling"]);
    expect(changes[0]).toMatchObject({ days: [{ title: "New plan", description: "" }] });
    const many = Array.from({ length: 70 }, (_, index) => ({
      kind: "note_add",
      line: `Note ${String(index)}`,
      lines: ["L1"],
    }));
    expect(ground(many, { L1: Array.from({ length: 70 }, (_, index) => String(index)).join(" ") })).toHaveLength(60);
  });

  it("says where each cited line is from, and reads only real photos' lines", () => {
    const change = only(
      ground(
        [{ kind: "note_add", line: "Carry ID proof", lines: ["L1", "P1.L1", "A1", "P2.L1", "P0.L1"] }],
        { L1: "Note this", "P1.L1": "Carry ID proof", A1: "Yes" },
        everything,
        {
          count: 2,
          lines: [
            { ref: "P2.L1", text: "ID proof needed" },
            { ref: "P0.L1", text: "Not a photo" },
          ],
        },
      ),
    );
    expect(change.evidence).toEqual([
      { ref: "L1", text: "Note this", kind: "message" },
      { ref: "P1.L1", text: "Carry ID proof", kind: "pdf" },
      { ref: "A1", text: "Yes", kind: "answer" },
      { ref: "P2.L1", text: "ID proof needed", kind: "photo" },
    ]);
  });
});
