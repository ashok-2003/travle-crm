// A trip's calendar: departures in the range (cancelled too) with the resolved price, its source, and the same seat counts the list gives.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDepartures, packageCalendar } from "../../src/departures/index.js";
import { savePackageSeason } from "../../src/quotes/index.js";
import { aBookingOn, now, openWorld, type World } from "./support.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

describe("packageCalendar", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Calendar");
  });
  afterAll(async () => {
    await world.close();
  });

  it("lists the range with prices, sources and the seats the list shows", async () => {
    const { packageId, plain, own, cancelled, outside } = await world.inOrg(async (tx) => {
      const trip = await tx.quoteTemplate.create({
        data: { name: "Calendar trip", title: "Calendar", kind: "group", roomTypes: ["double"] },
        select: { id: true },
      });
      await savePackageSeason(tx, world.manager, {
        packageId: trip.id,
        label: "Regular",
        startsOn: "2026-11-01",
        endsOn: "2026-12-31",
        prices: { ...none, double: 4_000_000 },
      });
      const make = (startDate: string, extra: object = {}) =>
        tx.departure.create({
          data: {
            title: `Batch ${startDate}`,
            templateId: trip.id,
            startDate: new Date(`${startDate}T00:00:00Z`),
            endDate: new Date(`${startDate}T00:00:00Z`),
            seatsTotal: 10,
            ...extra,
          },
          select: { id: true },
        });
      return {
        packageId: trip.id,
        plain: await make("2026-11-10"),
        own: await make("2026-11-11", { priceDoublePaise: 5_000_000n }),
        cancelled: await make("2026-11-12", { status: "cancelled", cancelledReason: "Road closed" }),
        outside: await make("2027-03-01"),
      };
    });
    await aBookingOn(world, plain.id, { adults: 3 });
    const calendar = await world.inOrg((tx) =>
      packageCalendar(tx, { packageId, from: "2026-11-10", to: "2026-11-30" }, now),
    );
    expect(calendar.map((row) => row.departureId)).toEqual([plain.id, own.id, cancelled.id]);
    expect(calendar.some((row) => row.departureId === outside.id)).toBe(false);
    expect(calendar[0]).toMatchObject({ priceSource: "season", seasonLabel: "Regular" });
    expect(calendar[0]?.prices.double).toBe(4_000_000);
    expect(calendar[1]).toMatchObject({ priceSource: "departure" });
    expect(calendar[1]?.prices.double).toBe(5_000_000);
    expect(calendar[1]?.ownPrices.double).toBe(5_000_000);
    expect(calendar[2]).toMatchObject({ status: "cancelled" });
    const listed = await world.inOrg((tx) =>
      listDepartures(tx, world.manager, { filter: "upcoming", templateId: packageId }, now),
    );
    const same = listed.find((row) => row.id === plain.id);
    expect(calendar[0]).toMatchObject({
      seatsTotal: same?.seatsTotal,
      seatsSold: same?.sold,
      seatsHeld: same?.held,
      seatsFree: same?.free,
    });
    expect(calendar[0]?.seatsSold).toBe(3);
  });

  it("gives no price and source none outside every season", async () => {
    const packageId = await world.inOrg(async (tx) => {
      const trip = await tx.quoteTemplate.create({
        data: { name: "No season", title: "No season", kind: "group", roomTypes: ["double"] },
        select: { id: true },
      });
      await tx.departure.create({
        data: {
          title: "Lone",
          templateId: trip.id,
          startDate: new Date("2026-11-20T00:00:00Z"),
          endDate: new Date("2026-11-21T00:00:00Z"),
          seatsTotal: 4,
        },
      });
      return trip.id;
    });
    const calendar = await world.inOrg((tx) =>
      packageCalendar(tx, { packageId, from: "2026-11-01", to: "2026-11-30" }, now),
    );
    expect(calendar[0]).toMatchObject({ priceSource: "none", seasonLabel: null });
  });
});
