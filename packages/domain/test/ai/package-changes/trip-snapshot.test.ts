// The trip as the AI change assistant reads it: season columns with their dates, departures ahead with their ids, seats
// and own prices, the repeats, seats and advance, numbered notes and the trip's details; and its stamp, which changes
// when any of them changes and not when a booking is taken or a field it doesn't read is changed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tripSnapshot, tripStamp } from "../../../src/ai/package-changes/trip-snapshot.js";
import { setDepartureSeats } from "../../../src/departures/index.js";
import { aBookingOn } from "../../departures/support.js";
import { openWorld, type World } from "../../bookings/support.js";
import { aTrip, NOW, TODAY } from "./support.js";

describe("the trip snapshot", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Trip snapshot");
  });
  afterAll(() => world.close());

  const snapshotOf = (packageId: string) => world.inOrg((tx) => tripSnapshot(tx, packageId, TODAY, NOW));

  it("lists the seasons, departures ahead, repeats, seats, advance, notes and details", async () => {
    const trip = await aTrip(world);
    const snapshot = await snapshotOf(trip.packageId);
    expect(snapshot.columns.map((column) => [column.ref, column.label, column.seasonIds, column.open])).toEqual([
      ["S1", "Regular", [trip.seasons.regularBefore, trip.seasons.regularAfter], true],
      ["S2", "Christmas", [trip.seasons.christmas], false],
    ]);
    expect(snapshot.departures.map((one) => [one.ref, one.id, one.status, one.seatsTotal])).toEqual([
      ["D1", trip.departures.dec4, "open", 40],
      ["D2", trip.departures.dec11, "cancelled", 40],
      ["D3", trip.departures.dec18, "open", 40],
    ]);
    expect(snapshot.departures[2]?.ownPrices.double).toBe(949_900);
    expect(snapshot.notes).toEqual([
      { ref: "N1", line: "Carry warm clothes" },
      { ref: "N2", line: "No refunds after departure" },
    ]);
    const lines = snapshot.text.split("\n");
    expect(lines).toEqual(
      expect.arrayContaining([
        "Room types sold: double, triple",
        "S1 Regular, all other days: double ₹6,999, triple ₹5,999",
        "S2 Christmas, Fri 18 Dec 2026 to Fri 1 Jan 2027: double ₹8,999, triple not sold",
        "D1 Fri 4 Dec 2026: open, 40 seats, 0 sold, 0 held; double ₹6,999, triple ₹5,999",
        "D2 Fri 11 Dec 2026: cancelled",
        "D3 Fri 18 Dec 2026: open, 40 seats, 0 sold, 0 held; double ₹9,499, triple not sold (its own prices)",
        "Repeats: every Fri, every month (new departures are made 12 weeks ahead)",
        "Seats for each new departure: 40",
        "Advance to hold a seat: ₹2,000 per person",
        "Where it starts: Delhi",
        "  Delhi ISBT at 6 pm",
        "  Hotel",
        "  Breakfast",
        "  Lunch",
        "  50% charged within 15 days",
        "N1 Carry warm clothes",
        "N2 No refunds after departure",
        "Day 1: Delhi to the hills | Overnight Volvo",
        "AI selling it: off",
      ]),
    );
    expect(snapshot.text).toContain("Trip: Hill town 4N/5D");
    expect(snapshot.text).not.toContain("2 Jul 2027");
  });

  it("stamps the same trip the same, and changes the stamp when the trip changes", async () => {
    const trip = await aTrip(world);
    const first = tripStamp(await snapshotOf(trip.packageId));
    expect(tripStamp(await snapshotOf(trip.packageId))).toBe(first);

    // A booking and a field the assistant doesn't read are not changes to the trip.
    await aBookingOn(world, trip.departures.dec4, { adults: 2 });
    await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { summary: "Other" } }));
    expect(tripStamp(await snapshotOf(trip.packageId))).toBe(first);

    const changedBy = async (change: () => Promise<unknown>) => {
      const before = tripStamp(await snapshotOf(trip.packageId));
      await change();
      return tripStamp(await snapshotOf(trip.packageId)) !== before;
    };
    expect(
      await changedBy(() =>
        world.inOrg((tx) =>
          setDepartureSeats(tx, world.manager, { departureId: trip.departures.dec4, seatsTotal: 30 }, NOW),
        ),
      ),
    ).toBe(true);
    expect(
      await changedBy(() =>
        world.inOrg((tx) =>
          tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { notes: "Carry warm clothes" } }),
        ),
      ),
    ).toBe(true);
    expect(
      await changedBy(() =>
        world.inOrg((tx) =>
          tx.packageSeason.update({ where: { id: trip.seasons.christmas }, data: { priceDoublePaise: 1_000_000n } }),
        ),
      ),
    ).toBe(true);
    expect(
      await changedBy(() =>
        world.inOrg((tx) =>
          tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { pickupPoints: "Majnu ka Tilla" } }),
        ),
      ),
    ).toBe(true);
    expect(
      await changedBy(() =>
        world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { aiSellable: true } })),
      ),
    ).toBe(true);
  });
});
