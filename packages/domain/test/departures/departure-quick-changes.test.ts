// The narrow departure writes: seats never below what is sold or held, and own prices set or cleared, each audited.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDeparturePrices, setDepartureSeats } from "../../src/departures/index.js";
import { aBookingOn, aDeparture, now, openWorld, type World } from "./support.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("quick departure changes", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Quick changes");
  });
  afterAll(async () => {
    await world.close();
  });
  const audited = (departureId: string) =>
    world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: departureId, action: "departure.changed" }, select: { id: true } }),
    );

  it("changes seats, audited, and refuses fewer than sold plus held", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    await aBookingOn(world, departure.id, { adults: 4 });
    expect(
      await reasonOf(
        world.inOrg((tx) => setDepartureSeats(tx, world.manager, { departureId: departure.id, seatsTotal: 3 }, now)),
      ),
    ).toBe("SEATS_BELOW_BOOKED");
    await world.inOrg((tx) => setDepartureSeats(tx, world.manager, { departureId: departure.id, seatsTotal: 4 }, now));
    const row = await world.inOrg((tx) =>
      tx.departure.findUniqueOrThrow({ where: { id: departure.id }, select: { seatsTotal: true } }),
    );
    expect(row.seatsTotal).toBe(4);
    expect(await audited(departure.id)).toHaveLength(1);
  });

  it("stores own prices, and all null clears them, each audited", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    await world.inOrg((tx) =>
      setDeparturePrices(tx, world.manager, {
        departureId: departure.id,
        prices: { ...none, double: 6_000_000, single: 7_000_000 },
      }),
    );
    const set = await world.inOrg((tx) =>
      tx.departure.findUniqueOrThrow({
        where: { id: departure.id },
        select: { priceDoublePaise: true, priceSinglePaise: true },
      }),
    );
    expect(set).toEqual({ priceDoublePaise: 6_000_000n, priceSinglePaise: 7_000_000n });
    await world.inOrg((tx) => setDeparturePrices(tx, world.manager, { departureId: departure.id, prices: none }));
    const cleared = await world.inOrg((tx) =>
      tx.departure.findUniqueOrThrow({ where: { id: departure.id }, select: { priceDoublePaise: true } }),
    );
    expect(cleared.priceDoublePaise).toBeNull();
    expect(await audited(departure.id)).toHaveLength(2);
  });
});
