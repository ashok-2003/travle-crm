// The natural agent's read tools on a seeded agency: find_trips over titles, places, stops and pickups in the month
// asked, get_trip in full and uncut, and quote's figures and refusals, each refusal naming the way on.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fenced } from "../../../src/ai/fenced.js";
import { findTrips } from "../../../src/ai/natural/tools/find-trips.js";
import { quoteFor, runReadTool, type ReadContext } from "../../../src/ai/natural/tools/read-tools.js";
import { tripSheetsOf } from "../../../src/ai/natural/trips/trip-sheets.js";
import { tripIndexEntry, tripInFull } from "../../../src/ai/natural/trips/trip-text.js";
import { addDays, parseCalendarDate, type CalendarDate } from "../../../src/kernel/index.js";
import { sellablePackages } from "../../../src/quotes/index.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { day } from "../lite/support/lite-agency.js";
import { naturalAgency } from "./support/natural-agency.js";

// Sat 5 Dec, noon in Kolkata: T1's Sat 5 Dec batch leaves today, so its open dates are Sat 12, 19 and 26 Dec.
const today = parseCalendarDate("2026-12-05");
// Sun 15 Nov: three weeks before T1's first batch, for dates past a sheet's 8.
const midNovember = parseCalendarDate("2026-11-15");
const days = (...texts: string[]) => texts.map(parseCalendarDate);

/** Every `step`th day from `from` to `until`, both ends included. */
function everyDay(from: string, until: string, step = 1): string[] {
  const all: string[] = [];
  for (let at = parseCalendarDate(from); at <= until; at = addDays(at, step)) all.push(at);
  return all;
}
/** More batches of a trip, 20 seats each; a day it has one already keeps it. */
const batches = (tx: OrgTx, templateId: string, dates: readonly string[]) =>
  tx.departure.createMany({
    skipDuplicates: true,
    data: dates.map((on) => ({ title: "Batch", startDate: day(on), endDate: day(on), seatsTotal: 20, templateId })),
  });
/** A January season for a trip, at ₹10,999 triple. */
const januarySeason = (tx: OrgTx, templateId: string) =>
  tx.packageSeason.create({
    data: {
      templateId,
      label: "January",
      startsOn: day("2027-01-01"),
      endsOn: day("2027-01-31"),
      priceTriplePaise: 1_099_900n,
    },
  });

describe("the natural agent's read tools", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(options: { trips?: number } = {}) {
    const agency = await naturalAgency(test, options);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(agency.organizationId, work);
    /** Runs `work` with the read context a turn builds on `on` (noon in Kolkata): the sellable trips' sheets and labels. */
    const withContext = <T>(work: (context: ReadContext) => Promise<T>, on: CalendarDate = today) =>
      inOrg(async (tx) => {
        const at = new Date(`${on}T06:30:00Z`);
        const sheets = await tripSheetsOf(tx, await sellablePackages(tx, agency.organizationId, on), on, at);
        const labels = new Map(sheets.map((sheet) => [sheet.label, sheet.packageId]));
        return work({ tx, sheets, labels, today: on, now: at });
      });
    const read = (name: "find_trips" | "get_trip" | "quote", args: Record<string, unknown>, on?: CalendarDate) =>
      withContext((context) => runReadTool(context, name, args), on);
    const sheets = () => withContext((context) => Promise.resolve(context.sheets));
    const [kedarkantha = "", brahmatal = ""] = agency.packageIds;
    return { ...agency, inOrg, withContext, read, sheets, kedarkantha, brahmatal };
  }

  /** Sells T1 in double rooms too, at ₹12,999 per person. */
  const withDoubles = (tx: OrgTx, packageId: string) =>
    Promise.all([
      tx.quoteTemplate.update({ where: { id: packageId }, data: { roomTypes: ["double", "triple"] } }),
      tx.packageSeason.updateMany({ where: { templateId: packageId }, data: { priceDoublePaise: 1_299_900n } }),
    ]);

  describe("find_trips", () => {
    it("finds a trip by an itinerary stop", async () => {
      const { read, sheets } = await world();
      const [kedarkantha, brahmatal] = await sheets();
      expect(await read("find_trips", { query: "Bekaltal" })).toEqual({
        result: fenced(tripIndexEntry(brahmatal ?? expect.unreachable(), today)),
        figures: null,
      });
      // A pickup point counts as well.
      expect((await read("find_trips", { query: "ISBT pickup" })).result).toBe(
        fenced(tripIndexEntry(kedarkantha ?? expect.unreachable(), today)),
      );
    });

    it("says a near spelling is the closest, not a match", async () => {
      const { read, sheets } = await world();
      const [kedarkantha] = await sheets();
      const { result } = await read("find_trips", { query: "Kedarkanta" });
      expect(result).toBe(
        `closest, not a match:\n${fenced(tripIndexEntry(kedarkantha ?? expect.unreachable(), today))}`,
      );
    });

    it("keeps only trips leaving in the month asked, and shows that month's dates", async () => {
      const { read, inOrg, sheets, brahmatal } = await world();
      await inOrg(async (tx) => {
        await batches(tx, brahmatal, ["2027-01-09"]);
        await januarySeason(tx, brahmatal);
      });
      const [kedarkantha = expect.unreachable(), brahmatalSheet = expect.unreachable()] = await sheets();
      const answer = async (query: string) => (await read("find_trips", { query })).result;
      expect(await answer("January treks")).toBe(fenced(tripIndexEntry(brahmatalSheet, today, days("2027-01-09"))));
      expect(await answer("December")).toBe(
        [
          fenced(tripIndexEntry(kedarkantha, today, days("2026-12-12", "2026-12-19", "2026-12-26"))),
          fenced(tripIndexEntry(brahmatalSheet, today, days("2026-12-12", "2026-12-26"))),
        ].join("\n\n"),
      );
      // A trip the words name, with no date in the month: said so, with its next dates.
      expect(await answer("Kedarkantha January")).toBe(
        'none of the trips matching "kedarkantha" leaves in January 2027; their next dates:\n' +
          fenced(tripIndexEntry(kedarkantha, today)),
      );
      expect(await answer("March")).toBe("no trip leaves in March 2027; the trips are T1, T2");
      // "may" is a month only written "May".
      expect(findTrips(await sheets(), "treks families may like", today).months).toEqual([]);
      expect(findTrips(await sheets(), "May treks", today).months).toEqual(["2027-05"]);
    });

    it("finds a trip leaving every day in a month past its sheet's 8 dates, with that month's dates", async () => {
      const { read, inOrg, brahmatal } = await world();
      await inOrg(async (tx) => {
        await batches(tx, brahmatal, everyDay("2026-11-16", "2027-01-31"));
        await januarySeason(tx, brahmatal);
      });
      const { result } = await read("find_trips", { query: "trips in January?" }, midNovember);
      expect(result).toMatch(/^Name: Brahmatal Trek\nID for tools: T2\n/u);
      expect(result).toContain(
        "\nDates: Fri 1 Jan 2027, Sat 2 Jan 2027, Sun 3 Jan 2027, Mon 4 Jan 2027, Tue 5 Jan 2027 and 26 more\n",
      );
      expect(result.split("\n\n")).toHaveLength(1);
      // get_trip lists the next 8, and says where the rest are.
      expect((await read("get_trip", { trip_id: "T2" }, midNovember)).result).toMatch(
        /\nOnly the next 8 dates are listed; find_trips with the trip and a month, or quote on a date, reaches later ones\.$/u,
      );
    });

    it("finds a weekly trip in a month past its 8th week, and quotes a date there", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg(async (tx) => {
        await batches(tx, kedarkantha, everyDay("2027-01-02", "2027-02-27", 7));
        await tx.packageSeason.updateMany({ where: { templateId: kedarkantha }, data: { endsOn: day("2027-02-28") } });
      });
      expect((await read("find_trips", { query: "Kedarkantha February" }, midNovember)).result).toContain(
        "\nDates: Sat 6 Feb 2027, Sat 13 Feb 2027, Sat 20 Feb 2027, Sat 27 Feb 2027\n",
      );
      expect((await read("quote", { trip_id: "T1", date: "2027-02-13", adults: 2 }, midNovember)).result).toBe(
        "Kedarkantha Trek, Sat 13 Feb 2027, 2 adults: triple ₹9,499 per person, GST included; total ₹18,998; " +
          "advance ₹3,000 per person, ₹6,000 in all; seats: open",
      );
    });

    it("answers words that name no trip with what it searched and the way on", async () => {
      const { read, sheets } = await world();
      const [kedarkantha = expect.unreachable(), brahmatal = expect.unreachable()] = await sheets();
      expect((await read("find_trips", { query: "December dates" })).result).toBe(
        'nothing matches "dates"; leaving in December:\n' +
          [
            fenced(tripIndexEntry(kedarkantha, today, days("2026-12-12", "2026-12-19", "2026-12-26"))),
            fenced(tripIndexEntry(brahmatal, today, days("2026-12-12", "2026-12-26"))),
          ].join("\n\n"),
      );
      expect((await read("find_trips", { query: "family trips" })).result).toBe(
        'no title, place, stop or pickup says "family"; the trips are T1, T2',
      );
    });

    it("answers at most 5 entries, the trips matching more of the words first", async () => {
      const { read } = await world({ trips: 7 });
      const entries = (await read("find_trips", { query: "trek" })).result.split("\n\n");
      expect(entries).toHaveLength(5);
      expect((await read("find_trips", { query: "Brahmatal trek" })).result).toMatch(
        /^Name: Brahmatal Trek\nID for tools: T2\n/u,
      );
    });
  });

  describe("get_trip", () => {
    it("returns a trip in full by its label, with the owner's text uncut", async () => {
      const { read, inOrg, sheets, kedarkantha } = await world();
      const notes = `${"Carry warm layers, a head torch and two water bottles. ".repeat(9)}Summit at 3,800 m.`;
      const pickups = Array.from({ length: 8 }, (_, index) => `Pickup point ${String(index + 1)}`);
      await inOrg((tx) =>
        tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { notes, pickupPoints: pickups.join("\n") } }),
      );
      const { result, figures } = await read("get_trip", { trip_id: "T1" });
      expect(result.split("\n").slice(0, 2)).toEqual(["Name: Kedarkantha Trek", "ID for tools: T1"]);
      expect(result).toContain(`Notes: ${notes}`);
      expect(result).toContain(`Pickup points: ${pickups.join("; ")}`);
      expect(figures).toBeNull();
      // The sheet in the prompt cuts both, for its budget.
      const [inPrompt] = await sheets();
      expect(tripInFull(inPrompt ?? expect.unreachable(), today)).not.toContain("Summit at 3,800 m.");
      // The label is the turn's own.
      expect((await read("get_trip", { trip_id: "T2" })).result).toMatch(/^Name: Brahmatal Trek\nID for tools: T2\n/u);
    });
  });

  describe("quote", () => {
    it("quotes per person, total and advance from the price table", async () => {
      const { read, inOrg, kedarkantha } = await world();
      const { result, figures } = await read("quote", { trip_id: "T1", date: "2026-12-12", adults: 2, room: "triple" });
      const batch = await inOrg((tx) =>
        tx.departure.findFirstOrThrow({ where: { templateId: kedarkantha, startDate: day("2026-12-12") } }),
      );
      expect(result).toBe(
        "Kedarkantha Trek, Sat 12 Dec, 2 adults: triple ₹9,499 per person, GST included; total ₹18,998; " +
          "advance ₹3,000 per person, ₹6,000 in all; seats: open",
      );
      expect(figures).toEqual({
        terms: {
          packageId: kedarkantha,
          startsOn: "2026-12-12",
          adults: 2,
          childrenAges: [],
          room: "triple",
          payInFull: false,
        },
        departureId: batch.id,
        perPersonPaise: 949_900,
        totalPaise: 1_899_800,
        advancePaise: 600_000,
        advancePerPersonPaise: 300_000,
        freeSeats: 20,
      });
    });

    it("adds GST to a total when the prices exclude it", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg((tx) => tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { pricesIncludeGst: false } }));
      const { result, figures } = await read("quote", { trip_id: "T1", date: "2026-12-12", adults: 2 });
      expect(result).toContain("triple ₹9,499 per person, plus 5% GST; total ₹19,947.90;");
      expect(figures).toMatchObject({ perPersonPaise: 949_900, totalPaise: 1_994_790 });
    });

    it("gives a child the child's bed when the trip prices one, and says which room it used", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg((tx) =>
        Promise.all([
          tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { roomTypes: ["triple", "child_bed"] } }),
          tx.packageSeason.updateMany({ where: { templateId: kedarkantha }, data: { priceChildBedPaise: 600_000n } }),
        ]),
      );
      // A trek of triple tents has no double to give: the quote uses the triple and says so.
      const { result, figures } = await read("quote", {
        trip_id: "T1",
        date: "2026-12-19",
        adults: 2,
        children_ages: [8],
        room: "double",
      });
      expect(result).toBe(
        "Kedarkantha Trek, Sat 19 Dec, 2 adults, 1 child (8): triple ₹9,499, child with bed ₹6,000 per person " +
          "(triple is the only room this trip sells), GST included; total ₹24,998; " +
          "advance ₹3,000 per person, ₹9,000 in all; seats: open",
      );
      expect(figures).toMatchObject({ terms: { room: "triple", childrenAges: [8] }, totalPaise: 2_499_800 });
    });

    it("refuses a child's place with no price, naming the team as the way on", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg((tx) =>
        tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { roomTypes: ["triple", "child_bed"] } }),
      );
      expect((await read("quote", { trip_id: "T1", date: "2026-12-19", adults: 2, children_ages: [8] })).result).toBe(
        "refused: child with bed isn't priced for Sat 19 Dec; ask the team with create_task(question)",
      );
    });

    it("refuses a date with no departure, naming the nearest open ones (never one leaving today)", async () => {
      const { read } = await world();
      const refusal = "refused: no departure on Fri 11 Dec; open: Sat 12 Dec, Sat 19 Dec, Sat 26 Dec";
      expect(await read("quote", { trip_id: "T1", date: "2026-12-11", adults: 2 })).toEqual({
        result: refusal,
        figures: null,
      });
      expect((await read("quote", { trip_id: "T1", date: "2026-12-05", adults: 2 })).result).toBe(
        "refused: no departure on Sat 5 Dec; open: Sat 12 Dec, Sat 19 Dec, Sat 26 Dec",
      );
    });

    it("refuses a date with too few seats, naming the nearest that seat the party", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg(async (tx) => {
        await tx.departure.updateMany({
          where: { templateId: kedarkantha, startDate: day("2026-12-19") },
          data: { seatsTotal: 3 },
        });
        await tx.departure.updateMany({
          where: { templateId: kedarkantha, startDate: day("2026-12-26") },
          data: { seatsTotal: 2 },
        });
      });
      expect((await read("quote", { trip_id: "T1", date: "2026-12-19", adults: 4 })).result).toBe(
        "refused: 3 left on Sat 19 Dec and the party is 4; open with seats: Sat 12 Dec",
      );
      expect((await read("quote", { trip_id: "T1", date: "2026-12-19", adults: 21 })).result).toBe(
        "refused: 3 left on Sat 19 Dec and the party is 21; open with seats: none",
      );
    });

    it("refuses a date the trip has no price for", async () => {
      const { read, inOrg, kedarkantha } = await world();
      // The season ends on 31 Dec, and this batch sets no price of its own.
      await inOrg((tx) =>
        tx.departure.create({
          data: {
            title: "Batch",
            startDate: day("2027-01-09"),
            endDate: day("2027-01-09"),
            seatsTotal: 20,
            templateId: kedarkantha,
          },
        }),
      );
      expect((await read("quote", { trip_id: "T1", date: "2027-01-09", adults: 2 })).result).toBe(
        "refused: no price is set for Sat 9 Jan 2027; open: Sat 12 Dec, Sat 19 Dec, Sat 26 Dec",
      );
    });

    it("refuses a room that isn't priced, naming the priced ones", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg((tx) => withDoubles(tx, kedarkantha));
      expect((await read("quote", { trip_id: "T1", date: "2026-12-12", adults: 2, room: "quad" })).result).toBe(
        "refused: quad isn't priced; priced: double, triple",
      );
    });

    it("asks for a room the adults can take when the trip sells several", async () => {
      const { read, inOrg, kedarkantha } = await world();
      await inOrg((tx) => withDoubles(tx, kedarkantha));
      const quote = async (args: Record<string, unknown>) =>
        (await read("quote", { trip_id: "T1", date: "2026-12-12", ...args })).result;
      expect(await quote({ adults: 2 })).toBe("refused: room is needed for this trip; priced: double, triple");
      expect(await quote({ adults: 2, room: "child_bed" })).toBe(
        "refused: child with bed is a child's place, not a room for the adults; priced: double, triple",
      );
      expect(await quote({ adults: 3, room: "double" })).toBe(
        "refused: 3 people don't fill double rooms of 2; priced: double, triple",
      );
      expect(await quote({ adults: 2, room: "double" })).toContain(
        "double ₹12,999 per person, GST included; total ₹25,998;",
      );
    });

    it("refuses a trip outside the turn's labels", async () => {
      const { read } = await world();
      const refusal = { result: "refused: T9 isn't one of the trips; the trips are T1, T2", figures: null };
      expect(await read("quote", { trip_id: "T9", date: "2026-12-12", adults: 2 })).toEqual(refusal);
      expect(await read("get_trip", { trip_id: "T9" })).toEqual(refusal);
    });
  });

  describe("quoteFor", () => {
    it("gives book the quote's own figures, with the room the quote used", async () => {
      const { withContext, kedarkantha } = await world();
      const terms = {
        packageId: kedarkantha,
        startsOn: "2026-12-12",
        adults: 2,
        childrenAges: [],
        room: null,
        payInFull: false,
      };
      const [figures, tool] = await withContext(
        async (context) =>
          [
            await quoteFor(context, terms),
            await runReadTool(context, "quote", { trip_id: "T1", date: "2026-12-12", adults: 2 }),
          ] as const,
      );
      expect(figures).toEqual(tool.figures);
      expect(figures).toMatchObject({ terms: { room: "triple" }, totalPaise: 1_899_800 });
      expect(await withContext((context) => quoteFor(context, { ...terms, startsOn: "2026-12-11" }))).toEqual({
        refused: "refused: no departure on Fri 11 Dec; open: Sat 12 Dec, Sat 19 Dec, Sat 26 Dec",
      });
      expect(
        await withContext((context) =>
          quoteFor(context, { ...terms, packageId: "0190f5a0-0000-7000-8000-000000000000" }),
        ),
      ).toEqual({
        refused: "refused: that trip isn't on sale now; the trips are T1, T2",
      });
    });
  });
});
