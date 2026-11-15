// The natural agent's trips read from the database: owner text cleaned but every number kept, priced rooms only,
// nothing of the package's internal side, labels in the saved order, and a fixed number of reads however many trips.
import { PACKAGE_BROCHURE_RECORD_TYPE, PACKAGE_PHOTO_RECORD_TYPE } from "@travel-crm/contracts/files";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tripSheetsOf } from "../../../src/ai/natural/trips/trip-sheets.js";
import { tripIndexLine, tripInFull } from "../../../src/ai/natural/trips/trip-text.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { sellablePackages } from "../../../src/quotes/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { countingDatabase } from "../lite/support/counting-db.js";
import { naturalAgency } from "./support/natural-agency.js";

const today = parseCalendarDate("2026-11-14");
const now = new Date("2026-11-14T12:00:00Z");

describe("the natural agent's trip sheets", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(options: { trips?: number } = {}) {
    const agency = await naturalAgency(test, options);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(agency.organizationId, work);
    const sheets = (on = today) =>
      inOrg(async (tx) => tripSheetsOf(tx, await sellablePackages(tx, agency.organizationId, on), on, now));
    const [kedarkantha = "", brahmatal = ""] = agency.packageIds;
    return { ...agency, inOrg, sheets, kedarkantha, brahmatal };
  }

  it("reads a trip's text, prices, advance, next open departures and files from the data", async () => {
    const { inOrg, sheets, kedarkantha } = await world();
    await inOrg(async (tx) => {
      await tx.packageSeason.create({
        data: {
          templateId: kedarkantha,
          label: "Autumn",
          startsOn: new Date("2026-10-01T00:00:00Z"),
          endsOn: new Date("2026-10-31T00:00:00Z"),
          priceTriplePaise: 899_900n,
        },
      });
      // A photo that arrived before the brochure still comes after it.
      await tx.attachment.create({
        data: {
          recordType: PACKAGE_PHOTO_RECORD_TYPE,
          recordId: kedarkantha,
          fileName: "camp.jpg",
          contentType: "image/jpeg",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date("2026-01-01T00:00:00Z"),
        },
      });
    });
    const [sheet] = await sheets();
    const files = await inOrg((tx) =>
      tx.attachment.findMany({ where: { recordId: kedarkantha }, select: { id: true, recordType: true } }),
    );
    const idOf = (recordType: string) => files.find((file) => file.recordType === recordType)?.id;
    expect(sheet).toMatchObject({
      label: "T1",
      packageId: kedarkantha,
      title: "Kedarkantha Trek",
      place: "Sankri, Uttarakhand",
      nights: 5,
      startCity: "Dehradun",
      pickups: ["Dehradun ISBT, 6:30 am", "Dehradun railway station, 7 am"],
      rooms: ["triple"],
      seasons: [{ name: "Winter", from: "2026-11-01", until: "2026-12-31", perPersonPaise: { triple: 949_900 } }],
      pricesIncludeGst: true,
      taxRateBasisPoints: 500,
      fromPaise: 949_900,
      advancePerPersonPaise: 300_000,
      fileIds: [idOf(PACKAGE_BROCHURE_RECORD_TYPE), idOf(PACKAGE_PHOTO_RECORD_TYPE)],
    });
    expect(sheet?.days[3]).toEqual({
      title: "Kedarkantha summit (3,800 m) and back",
      text: "Start at 3 am for the sunrise.",
    });
    expect(sheet?.departures.map((one) => [one.startsOn, one.freeSeats, one.priceFrom, one.perPersonPaise])).toEqual([
      ["2026-12-05", 20, "season", { triple: 949_900 }],
      ["2026-12-12", 20, "season", { triple: 949_900 }],
      ["2026-12-19", 20, "season", { triple: 949_900 }],
      ["2026-12-26", 20, "season", { triple: 949_900 }],
    ]);
    // A departure leaving today is no longer offered.
    const [onTheDay] = await sheets(parseCalendarDate("2026-12-05"));
    expect(onTheDay?.departures.map((one) => one.startsOn)).toEqual(["2026-12-12", "2026-12-19", "2026-12-26"]);
  });

  describe("each departure has the price the quote uses for its date (priceOn)", () => {
    /** A batch of T1 on `startsOn` with these own prices, and T1's sheet and text after it. */
    async function withBatch(startsOn: string, prices: { priceTriplePaise?: bigint; priceQuadPaise?: bigint } = {}) {
      const { inOrg, sheets, kedarkantha } = await world();
      const date = new Date(`${startsOn}T00:00:00Z`);
      await inOrg(async (tx) => {
        await tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { roomTypes: ["double", "triple"] } });
        await tx.packageSeason.updateMany({
          where: { templateId: kedarkantha },
          data: { priceDoublePaise: 1_099_900n },
        });
        await tx.departure.create({
          data: { title: "Batch", startDate: date, endDate: date, seatsTotal: 20, templateId: kedarkantha, ...prices },
        });
      });
      const [sheet] = await sheets();
      const batch = sheet?.departures.find((one) => one.startsOn === startsOn);
      return { batch, text: tripInFull(sheet ?? expect.unreachable(), today) };
    }

    it("gives a premium batch its own prices, only the rooms they price, as replacing the season's", async () => {
      const { batch, text } = await withBatch("2026-12-24", { priceTriplePaise: 1_199_900n });
      expect(batch).toMatchObject({ priceFrom: "departure", perPersonPaise: { triple: 1_199_900 } });
      expect(batch?.perPersonPaise).not.toHaveProperty("double");
      expect(text).toContain(
        "- Thu 24 Dec: open; this date's own prices replace the season's: triple ₹11,999 per person",
      );
      expect(text).toContain("- Sat 12 Dec: open\n");
    });

    it("says no price is set for a batch past the season's end", async () => {
      const { batch, text } = await withBatch("2027-01-09");
      expect(batch).toMatchObject({ priceFrom: "none", perPersonPaise: {} });
      expect(text).toContain("- Sat 9 Jan 2027: open; no price set for this date");
    });

    it("says no price is set for a batch whose own prices are only on rooms the trip doesn't sell", async () => {
      const { batch, text } = await withBatch("2026-12-24", { priceQuadPaise: 899_900n });
      expect(batch).toMatchObject({ priceFrom: "none", perPersonPaise: {} });
      expect(text).toContain("- Thu 24 Dec: open; no price set for this date");
    });

    it("never lists a full departure", async () => {
      const { inOrg, sheets, kedarkantha } = await world();
      await inOrg(async (tx) => {
        const full = await tx.departure.findFirstOrThrow({
          where: { templateId: kedarkantha, startDate: new Date("2026-12-19T00:00:00Z") },
        });
        const lead = await aLead(tx);
        await tx.departureHold.create({
          data: { departureId: full.id, leadId: lead.id, seats: 20, expiresAt: new Date("2999-01-01T00:00:00Z") },
        });
      });
      const [sheet] = await sheets();
      expect(sheet?.departures.map((one) => one.startsOn)).toEqual(["2026-12-05", "2026-12-12", "2026-12-26"]);
    });
  });

  it("drops payment details and emails from owner text but no number", async () => {
    const { inOrg, sheets, kedarkantha } = await world();
    await inOrg((tx) =>
      tx.quoteTemplate.update({
        where: { id: kedarkantha },
        data: {
          notes: "Pickup 6:30 am, summit at 3,800 m. Pay kk@okaxis or A/c 50100234567890, mail trips@casetrips.example",
          pickupPoints: "Dehradun ISBT, 6:30 am (call @casetrips)",
          days: [{ title: "Dehradun to Sankri", description: "Drive 220 km. Pay the driver at kkdriver@ybl" }],
        },
      }),
    );
    const [sheet] = await sheets();
    const text = tripInFull(sheet ?? expect.unreachable(), today);
    for (const kept of ["Pickup 6:30 am, summit at 3,800 m.", "Dehradun ISBT, 6:30 am", "Drive 220 km."]) {
      expect(text).toContain(kept);
    }
    for (const dropped of ["kk@okaxis", "50100234567890", "casetrips.example", "@casetrips", "kkdriver@ybl"]) {
      expect(text).not.toContain(dropped);
    }
  });

  it("lists only priced rooms", async () => {
    const { inOrg, sheets, kedarkantha } = await world();
    await inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: kedarkantha }, data: { roomTypes: ["double", "triple", "quad"] } }),
    );
    const [sheet] = await sheets();
    expect(sheet?.rooms).toEqual(["triple"]);
    expect(sheet?.seasons[0]?.perPersonPaise).toEqual({ triple: 949_900 });
    expect(tripInFull(sheet ?? expect.unreachable(), today)).not.toMatch(/double|quad/u);
  });

  it("reads no package's internal name, items or payment details", async () => {
    const { inOrg, sheets, kedarkantha } = await world();
    await inOrg((tx) =>
      tx.quoteTemplate.update({
        where: { id: kedarkantha },
        data: {
          name: "01 Kedarkantha INTERNAL-NAME",
          items: [{ description: "Guide fee SECRET-ITEM", detail: "", quantity: 1, unitPricePaise: 421_300 }],
          paymentDetails: "Pay SECRET-PAY at kkpay@okicici",
        },
      }),
    );
    const [sheet] = await sheets();
    for (const key of ["name", "items", "paymentDetails"]) expect(sheet).not.toHaveProperty(key);
    const text = `${tripInFull(sheet ?? expect.unreachable(), today)}\n${tripIndexLine(sheet ?? expect.unreachable(), today)}`;
    for (const seeded of ["INTERNAL-NAME", "SECRET-ITEM", "4,213", "SECRET-PAY", "kkpay"]) {
      expect(text).not.toContain(seeded);
    }
  });

  it("labels trips T1, T2 in the saved order", async () => {
    const { inOrg, organizationId, kedarkantha, brahmatal } = await world();
    const saved = await inOrg((tx) => sellablePackages(tx, organizationId, today));
    const labels = (sellable: typeof saved) =>
      inOrg(async (tx) =>
        (await tripSheetsOf(tx, sellable, today, now)).map((sheet) => [sheet.label, sheet.packageId, sheet.title]),
      );
    expect(await labels(saved)).toEqual([
      ["T1", kedarkantha, "Kedarkantha Trek"],
      ["T2", brahmatal, "Brahmatal Trek"],
    ]);
    expect(await labels([...saved].reverse())).toEqual([
      ["T1", brahmatal, "Brahmatal Trek"],
      ["T2", kedarkantha, "Kedarkantha Trek"],
    ]);
    expect(await labels(saved.map((one) => ({ ...one, kind: "custom" })))).toEqual([]);
  });

  it("reads 2 trips and 6 in the same number of queries", async () => {
    const counting = countingDatabase(test.db);
    const queries = async (trips: number) => {
      const { organizationId } = await naturalAgency(test, { trips });
      const sellable = await test.db.forOrg(organizationId, (tx) => sellablePackages(tx, organizationId, today));
      counting.reset();
      const read = await counting.db.forOrg(organizationId, (tx) => tripSheetsOf(tx, sellable, today, now));
      expect(read).toHaveLength(trips);
      return counting.count();
    };
    expect(await queries(6)).toBe(await queries(2));
  });
});
