// A group trip's quote from a departure and its rooms, against the real database: the price comes from the departure's own
// prices or the season of its day, GST is inside the price or on top, and a departure that can't take the party is refused.
import type { RoomPrices, UpdatePackageInput } from "@travel-crm/contracts/quotes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeGroupQuote } from "../../src/departures/index.js";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { createQuote, savePackage, savePackageSeason, updatePackage } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";
import { aLead } from "../crm/support/records.js";
import { aDeparture } from "./support.js";

const today = parseCalendarDate("2026-11-10");
const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};
const words = (overrides: Partial<UpdatePackageInput>): Omit<UpdatePackageInput, "packageId"> => ({
  name: "Spiti batch",
  title: "Spiti batch",
  days: [],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  slug: null,
  destinationId: null,
  nights: 6,
  summary: "",
  highlights: [],
  priceDisplay: "on_enquiry",
  fromPricePaise: null,
  defaultTravellerLevel: null,
  cancellationNotes: "",
  kind: "group",
  roomTypes: ["double", "triple"],
  pricesIncludeGst: true,
  advancePerPersonPaise: null,
  paymentDetails: "",
  pickupPoints: "",
  startCity: "",
  weeklyDays: [],
  departureMonths: [],
  seatsPerDeparture: null,
  ...overrides,
});

describe("a group trip's quote", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("GroupQuote");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aPackage(changes: Partial<UpdatePackageInput> = {}) {
    counter += 1;
    const name = `Group ${String(counter)}`;
    const id = await world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title: name,
          startDate: null,
          adults: 2,
          children: 0,
          days: [],
          items: [],
          inclusions: "",
          exclusions: "",
          notes: "",
          taxRateBasisPoints: 500,
          placeOfSupply: null,
        },
        context,
      );
      return (await savePackage(tx, world.manager, { quoteId: quote.id, name })).id;
    });
    await world.inOrg(async (tx) => {
      await updatePackage(tx, world.manager, { packageId: id, ...words({ name, title: name, ...changes }) });
      await savePackageSeason(tx, world.manager, {
        packageId: id,
        label: "Winter",
        startsOn: "2026-11-01",
        endsOn: "2027-03-31",
        prices: { ...noPrices, double: 800_000, triple: 699_900 },
      });
    });
    return { id, name };
  }

  async function aDepartureOf(
    packageId: string,
    seed: {
      startDate?: string;
      seatsTotal?: number;
      status?: string;
      cutoffOn?: string;
      own?: bigint;
      linked?: boolean;
    } = {},
  ) {
    return world.inOrg(async (tx) => {
      const departure = await aDeparture(tx, {
        startDate: seed.startDate ?? "2026-11-20",
        endDate: new Date(new Date(`${seed.startDate ?? "2026-11-20"}T00:00:00Z`).getTime() + 6 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        seatsTotal: seed.seatsTotal ?? 12,
        ...(seed.status === undefined ? {} : { status: seed.status }),
      });
      await tx.departure.update({
        where: { id: departure.id },
        data: {
          ...(seed.linked === false ? {} : { templateId: packageId }),
          ...(seed.cutoffOn === undefined ? {} : { cutoffOn: new Date(`${seed.cutoffOn}T00:00:00Z`) }),
          ...(seed.own === undefined ? {} : { priceTriplePaise: seed.own }),
        },
      });
      return departure.id;
    });
  }

  const leadId = () =>
    world.inOrg(async (tx) => (await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" })).id);
  const make = async (
    packageId: string,
    departureId: string,
    rooms: { roomType: "triple" | "double"; people: number }[],
  ) => {
    const lead = await leadId();
    return world.inOrg((tx) =>
      makeGroupQuote(tx, world.manager, { leadId: lead, packageId, departureId, rooms }, context, today),
    );
  };

  it("three in triple on a November departure: ₹20,997 told, ₹20,997 quoted", async () => {
    const { id, name } = await aPackage();
    const departureId = await aDepartureOf(id);
    const quote = await make(id, departureId, [{ roomType: "triple", people: 3 }]);
    expect(Math.abs(quote.totals.totalPaise - 2_099_700)).toBeLessThanOrEqual(2);
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toMatchObject({ description: `${name}, Triple sharing × 3`, quantity: 1 });
    expect(quote.departure?.id).toBe(departureId);
    expect(quote.taxRateBasisPoints).toBe(500);
    expect(quote.startDate).toBe("2026-11-20");
  });

  it("a premium batch is priced from its own prices", async () => {
    const { id } = await aPackage();
    const departureId = await aDepartureOf(id, { own: 999_900n });
    // The departure sets only triple, and brings its whole set: double is no longer priced there.
    const quote = await make(id, departureId, [{ roomType: "triple", people: 3 }]);
    expect(Math.abs(quote.totals.totalPaise - 2_999_700)).toBeLessThanOrEqual(2);
    expect(await reasonOf(make(id, departureId, [{ roomType: "double", people: 2 }]))).toBe("ROOM_NOT_PRICED");
  });

  it("refuses a full, closed or past departure, and too few seats", async () => {
    const { id } = await aPackage();
    const rooms = [{ roomType: "triple" as const, people: 3 }];
    expect(await reasonOf(make(id, await aDepartureOf(id, { startDate: "2026-11-24", status: "closed" }), rooms))).toBe(
      "DEPARTURE_NOT_OPEN",
    );
    expect(await reasonOf(make(id, await aDepartureOf(id, { startDate: "2026-11-05" }), rooms))).toBe(
      "DEPARTURE_NOT_OPEN",
    );
    expect(
      await reasonOf(make(id, await aDepartureOf(id, { startDate: "2026-11-21", cutoffOn: "2026-11-09" }), rooms)),
    ).toBe("DEPARTURE_NOT_OPEN");
    expect(await reasonOf(make(id, await aDepartureOf(id, { startDate: "2026-11-22", linked: false }), rooms))).toBe(
      "DEPARTURE_NOT_OPEN",
    );
    expect(await reasonOf(make(id, await aDepartureOf(id, { startDate: "2026-11-23", seatsTotal: 2 }), rooms))).toBe(
      "NOT_ENOUGH_SEATS",
    );
    expect(
      await reasonOf(
        make(id, await aDepartureOf(id, { startDate: "2026-11-25" }), [{ roomType: "triple", people: 4 }]),
      ),
    ).toBe("ROOM_SPLIT");
  });

  it("refuses a date no season prices", async () => {
    const { id } = await aPackage();
    const departureId = await aDepartureOf(id, { startDate: "2027-06-15" });
    expect(await reasonOf(make(id, departureId, [{ roomType: "triple", people: 3 }]))).toBe("NO_PRICE_FOR_DATE");
  });

  it("prices without GST add it on top", async () => {
    const { id } = await aPackage({ pricesIncludeGst: false });
    const departureId = await aDepartureOf(id);
    const quote = await make(id, departureId, [
      { roomType: "triple", people: 3 },
      { roomType: "double", people: 2 },
    ]);
    expect(quote.totals.subtotalPaise).toBe(2_099_700 + 1_600_000);
    // GST splits into two halves, each rounded, so the tax may sit a paisa off the flat 5%.
    expect(Math.abs(quote.totals.taxPaise - 184_985)).toBeLessThanOrEqual(1);
    expect(quote.totals.totalPaise).toBe(quote.totals.subtotalPaise + quote.totals.taxPaise);
    expect(quote.items.map((item) => item.unitPricePaise)).toEqual([2_099_700, 1_600_000]);
  });
});
