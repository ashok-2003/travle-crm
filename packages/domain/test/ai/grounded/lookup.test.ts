// The grounded turn's lookup against the real database: which packages a chat's facts point at, what they cost on the
// asked date, which departures are really open, and which files are still to send.
import type { RoomPrices, RoomType } from "@travel-crm/contracts/quotes";
import { chatFacts, type ChatFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookUp } from "../../../src/ai/grounded/lookup.js";
import { addPaymentQr } from "../support/payment-qr.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { openWorld, type World } from "../../bookings/support.js";

const today = parseCalendarDate("2026-11-06");
const now = new Date("2026-11-06T06:00:00Z");
const none: RoomPrices = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const column = {
  single: "priceSinglePaise",
  double: "priceDoublePaise",
  triple: "priceTriplePaise",
  quad: "priceQuadPaise",
  child_bed: "priceChildBedPaise",
  child_no_bed: "priceChildNoBedPaise",
} as const;
const columnsOf = (prices: Partial<RoomPrices>) =>
  Object.fromEntries(
    Object.entries(prices).flatMap(([type, value]) =>
      value == null ? [] : [[column[type as RoomType], BigInt(value)]],
    ),
  );
const day = (text: string) => new Date(`${text}T00:00:00Z`);

describe("looking up a chat's packages", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Grounded lookup");
    // The AI sells a group package only where the agency has somewhere to be paid.
    await world.inOrg(async (tx) => {
      await tx.organizationProfile.upsert({
        where: { organizationId: world.organizationId },
        create: { legalName: "Sharma Holidays", gstStateCode: "27", upiId: "sharma@okbank" },
        update: { upiId: "sharma@okbank" },
      });
      await addPaymentQr(tx, world.organizationId);
    });
  });
  afterAll(async () => {
    await world.close();
  });

  const facts = (changes: Partial<ChatFacts> = {}): ChatFacts => ({ ...chatFacts.parse({}), ...changes });
  const look = (changes: Partial<ChatFacts> = {}, nearest: string[] = []) =>
    world.inOrg((tx) => lookUp(tx, world.organizationId, facts(changes), today, now, nearest));

  async function aDestination(tx: OrgTx, name: string) {
    counter += 1;
    return (await tx.destination.create({ data: { name: `${name} ${String(counter)}` }, select: { id: true } })).id;
  }

  /** A group package the AI may sell: Nov and peak Dec seasons, and the departures given. */
  async function aGroup(
    tx: OrgTx,
    destinationId: string | null,
    departures: {
      start: string;
      seats?: number;
      status?: string;
      cutoffOn?: string;
      prices?: Partial<RoomPrices>;
    }[],
    changes: Record<string, unknown> = {},
  ) {
    counter += 1;
    const name = `Group ${String(counter).padStart(3, "0")}`;
    const template = await tx.quoteTemplate.create({
      data: {
        name,
        title: name,
        kind: "group",
        destinationId,
        roomTypes: ["double", "triple"],
        advancePerPersonPaise: 500_000n,
        aiSellable: true,
        nights: 6,
        ...changes,
      },
      select: { id: true },
    });
    const seasons = [
      ["Nov", "2026-11-01", "2026-11-30", { double: 699_900, triple: 599_900 }],
      ["Peak", "2026-12-15", "2027-01-05", { double: 899_900, triple: 799_900 }],
    ] as const;
    for (const [label, startsOn, endsOn, prices] of seasons) {
      await tx.packageSeason.create({
        data: { templateId: template.id, label, startsOn: day(startsOn), endsOn: day(endsOn), ...columnsOf(prices) },
      });
    }
    for (const one of departures) {
      await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day(one.start),
          endDate: day(one.start),
          seatsTotal: one.seats ?? 12,
          status: one.status ?? "open",
          cutoffOn: one.cutoffOn === undefined ? null : day(one.cutoffOn),
          templateId: template.id,
          ...columnsOf(one.prices ?? {}),
        },
      });
    }
    return template.id;
  }

  it("a December date prices from the peak season, a departure's own price wins", async () => {
    const { id, spiti } = await world.inOrg(async (tx) => {
      const spiti = await aDestination(tx, "Spiti");
      const id = await aGroup(tx, spiti, [
        { start: "2026-12-19" },
        { start: "2026-12-26", prices: { double: 949_900 } },
      ]);
      return { id, spiti };
    });
    const places = [{ destinationId: spiti, words: "Spiti" }];
    const season = (await look({ places, startsOn: parseCalendarDate("2026-12-19") })).packages[0];
    expect(season?.id).toBe(id);
    expect(season?.prices).toEqual({ ...none, double: 899_900, triple: 799_900 });
    const own = (await look({ places, startsOn: parseCalendarDate("2026-12-26") })).packages[0];
    // The batch brings its own whole set: the season's triple price is not borrowed.
    expect(own?.prices).toEqual({ ...none, double: 949_900 });
    expect(own?.chosenDeparture?.startsOn).toBe("2026-12-26");
  });

  it("a date in no season has no price", async () => {
    const spiti = await world.inOrg(async (tx) => {
      const destination = await aDestination(tx, "Kinnaur");
      await aGroup(tx, destination, [{ start: "2026-12-19" }, { start: "2027-02-06" }]);
      return destination;
    });
    const found = (
      await look({ places: [{ destinationId: spiti, words: "Kinnaur" }], startsOn: parseCalendarDate("2027-02-06") })
    ).packages[0];
    expect(found?.prices).toBeNull();
    expect(found?.total).toBeNull();
    // The lowest coming price is still known.
    expect(found?.from.double).toBe(699_900);
  });

  it("a full, closed or past-cut-off departure is never offered", async () => {
    const destination = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Leh");
      await aGroup(tx, place, [
        { start: "2026-11-20" },
        { start: "2026-11-21", seats: 0 },
        { start: "2026-11-22", status: "closed" },
        { start: "2026-11-23", cutoffOn: "2026-11-05" },
        { start: "2026-11-02" },
        { start: "2026-11-24" },
        { start: "2026-11-25" },
        { start: "2026-11-26" },
      ]);
      return place;
    });
    const found = (await look({ places: [{ destinationId: destination, words: "Leh" }] })).packages[0];
    // Soonest first, at most three.
    expect(found?.departures.map((one) => one.startsOn)).toEqual(["2026-11-20", "2026-11-24", "2026-11-25"]);
    expect(found?.departures[0]?.freeSeats).toBe(12);
    const full = await look({
      places: [{ destinationId: destination, words: "Leh" }],
      startsOn: parseCalendarDate("2026-11-21"),
    });
    expect(full.packages[0]?.chosenDeparture).toBeNull();
    expect(full.packages[0]?.prices).toBeNull();
  });

  it("a total needs every traveller roomed", async () => {
    const destination = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Manali");
      await aGroup(tx, place, [{ start: "2026-11-14" }]);
      return place;
    });
    const base = {
      places: [{ destinationId: destination, words: "Manali" }],
      startsOn: parseCalendarDate("2026-11-14"),
      travellers: 5,
    };
    expect((await look(base)).packages[0]?.total).toBeNull();
    const split = await look({
      ...base,
      rooms: [
        { roomType: "triple", people: 3 },
        { roomType: "double", people: 2 },
      ],
    });
    expect(split.packages[0]?.total).toBe(3 * 599_900 + 2 * 699_900);
    const short = await look({ ...base, rooms: [{ roomType: "double", people: 2 }] });
    expect(short.packages[0]?.total).toBeNull();
    const unpriced = await look({ ...base, rooms: [{ roomType: "quad", people: 5 }] });
    expect(unpriced.packages[0]?.total).toBeNull();
  });

  it("a package selling one room type puts every traveller in it, whatever rooms were said", async () => {
    const { tents, both } = await world.inOrg(async (tx) => {
      const tents = await aDestination(tx, "Kedarkantha");
      const both = await aDestination(tx, "Chopta");
      await aGroup(tx, tents, [{ start: "2026-11-14", prices: { triple: 499_800 } }], { roomTypes: ["triple"] });
      await aGroup(tx, both, [{ start: "2026-11-14", prices: { double: 599_800, triple: 499_800 } }]);
      return { tents, both };
    });
    const asked = (destinationId: string, changes: Partial<ChatFacts> = {}) =>
      look({
        places: [{ destinationId, words: "the trek" }],
        startsOn: parseCalendarDate("2026-11-14"),
        travellers: 4,
        ...changes,
      });
    // "We are 4": four in triple at ₹4,998 each.
    expect((await asked(tents)).packages[0]?.total).toBe(4 * 499_800);
    // "Triple sharing" read as one triple room (3 people) still leaves all four in triple.
    const said = await asked(tents, { rooms: [{ roomType: "triple", people: 3 }] });
    expect(said.packages[0]?.total).toBe(4 * 499_800);
    // With no travellers known there is still nothing to total.
    expect((await asked(tents, { travellers: null })).packages[0]?.total).toBeNull();
    // Two room types sold: the rooms are still the customer's to say.
    expect((await asked(both)).packages[0]?.total).toBeNull();
  });

  it("a custom package has from prices only", async () => {
    const destination = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Goa");
      counter += 1;
      await tx.quoteTemplate.create({
        data: {
          name: `Custom ${String(counter)}`,
          title: "Goa your way",
          destinationId: place,
          aiSellable: true,
          fromPricePaise: 1_800_000n,
          priceDisplay: "from",
        },
      });
      return place;
    });
    const found = (
      await look({
        places: [{ destinationId: destination, words: "Goa" }],
        startsOn: parseCalendarDate("2026-12-19"),
        travellers: 2,
        rooms: [{ roomType: "double", people: 2 }],
      })
    ).packages[0];
    expect(found?.kind).toBe("custom");
    expect(found?.fromPaise).toBe(1_800_000);
    expect(found?.prices).toBeNull();
    expect(found?.total).toBeNull();
    expect(found?.departures).toEqual([]);
  });

  it("files already sent are left out", async () => {
    const { destination, first, second, qr } = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Kasol");
      const id = await aGroup(tx, place, [{ start: "2026-11-20" }], { paymentDetails: "  " });
      const file = async (recordType: string, fileName: string) =>
        (
          await tx.attachment.create({
            data: {
              recordType,
              recordId: id,
              fileName,
              contentType: "application/pdf",
              sizeBytes: 1,
              status: "ready",
              confirmedAt: new Date(),
            },
            select: { id: true },
          })
        ).id;
      return {
        destination: place,
        first: await file("package_brochure", "kasol.pdf"),
        second: await file("package_brochure", "kasol-itinerary.pdf"),
        qr: await file("package_payment_qr", "qr.png"),
      };
    });
    const places = [{ destinationId: destination, words: "Kasol" }];
    const all = (await look({ places })).packages[0];
    expect(all?.brochures.map((one) => one.id)).toEqual([first, second]);
    expect(all?.hasPaymentQr).toBe(true);
    expect(all?.hasPaymentText).toBe(false);
    const rest = (await look({ places, sentFileIds: [first] })).packages[0];
    expect(rest?.brochures.map((one) => one.fileName)).toEqual(["kasol-itinerary.pdf"]);
    expect(JSON.stringify(rest)).not.toContain(qr);
  });

  it("a package of another destination is not looked up, and the order is chosen, place, nearest", async () => {
    const { here, far, near, chosen, other } = await world.inOrg(async (tx) => {
      const hereDestination = await aDestination(tx, "Here");
      const farDestination = await aDestination(tx, "Far");
      return {
        here: hereDestination,
        far: farDestination,
        near: await aGroup(tx, farDestination, [{ start: "2026-11-20" }]),
        chosen: await aGroup(tx, hereDestination, [{ start: "2026-11-20" }]),
        other: await aGroup(tx, hereDestination, [{ start: "2026-11-20" }]),
      };
    });
    const only = await look({ places: [{ destinationId: here, words: "Here" }] });
    expect(only.packages.map((one) => one.id)).toEqual([chosen, other]);
    expect(only.packages.map((one) => one.why)).toEqual([
      { kind: "place", words: "Here" },
      { kind: "place", words: "Here" },
    ]);
    const ordered = await look(
      { places: [{ destinationId: here, words: "Here" }], packageId: other, notRun: ["Atlantis"] },
      [near, "not-a-package", chosen],
    );
    expect(ordered.packages.map((one) => one.id)).toEqual([other, chosen, near]);
    expect(ordered.packages.map((one) => one.why.kind)).toEqual(["chosen", "place", "nearest"]);
    expect(ordered.packages[2]?.why).toEqual({ kind: "nearest", words: ["Atlantis"] });
    expect(ordered.notRun).toEqual(["Atlantis"]);
    expect(far).not.toBe(here);
  });

  it("at most five packages, and the agency's custom-trips switch comes along", async () => {
    const destination = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Many");
      for (let n = 0; n < 6; n += 1) await aGroup(tx, place, [{ start: "2026-11-20" }]);
      await tx.aiSettings.upsert({
        where: { organizationId: world.organizationId },
        create: { customTrips: true },
        update: { customTrips: true },
      });
      return place;
    });
    const found = await look({ places: [{ destinationId: destination, words: "Many" }] });
    expect(found.packages).toHaveLength(5);
    expect(found.customTrips).toBe(true);
  });

  it("a December ask lists December's departures, not November's", async () => {
    const destination = await world.inOrg(async (tx) => {
      const place = await aDestination(tx, "Auli");
      await aGroup(tx, place, [
        { start: "2026-11-20" },
        { start: "2026-11-27" },
        { start: "2026-12-05" },
        { start: "2026-12-12" },
        { start: "2026-12-19" },
        { start: "2026-12-26" },
      ]);
      return place;
    });
    const places = [{ destinationId: destination, words: "Auli" }];
    const days = async (changes: Partial<ChatFacts>) =>
      (await look({ places, ...changes })).packages[0]?.departures.map((one) => one.startsOn);
    expect(await days({ month: "2026-12" })).toEqual(["2026-12-05", "2026-12-12", "2026-12-19"]);
    expect(await days({ startsOn: parseCalendarDate("2026-12-12") })).toEqual([
      "2026-12-12",
      "2026-12-19",
      "2026-12-26",
    ]);
    expect(await days({})).toEqual(["2026-11-20", "2026-11-27", "2026-12-05"]);
    // Never before tomorrow, even when the asked day is today.
    expect(await days({ startsOn: today })).toEqual(["2026-11-20", "2026-11-27", "2026-12-05"]);
  });
});
