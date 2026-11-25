// A group trip's worked-out "From" price against the real database: the lowest adult room price over its open departures
// ahead, each priced the way a quote prices it (the season covering the day, a departure's own price laid over it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { createPackage, groupFromPrices, savePackageSeason } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";
import { aDeparture } from "../departures/support.js";

const today = parseCalendarDate("2026-11-10");
const none: RoomPrices = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

describe("groupFromPrices", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("GroupFromPrice");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aGroupTrip(prices: Partial<RoomPrices> | null) {
    counter += 1;
    const { id } = await world.inOrg((tx) =>
      createPackage(tx, world.manager, { name: `From ${String(counter)}`, kind: "group" }),
    );
    await world.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id }, data: { roomTypes: ["double", "quad", "child_bed"] } }),
    );
    if (prices !== null) {
      await world.inOrg((tx) =>
        savePackageSeason(tx, world.manager, {
          packageId: id,
          label: "Winter",
          startsOn: "2026-12-01",
          endsOn: "2026-12-31",
          prices: { ...none, ...prices },
        }),
      );
    }
    return id;
  }
  const depart = (id: string, startDate: string, own: Record<string, bigint> = {}) =>
    world.inOrg(async (tx) => {
      const made = await aDeparture(tx, { startDate, endDate: startDate });
      await tx.departure.update({ where: { id: made.id }, data: { templateId: id, ...own } });
    });
  const from = (...ids: string[]) => world.inOrg((tx) => groupFromPrices(tx, ids, today));

  it("is the lowest of the season's Quad and a departure's own Quad", async () => {
    const id = await aGroupTrip({ quad: 599_900, double: 700_000 });
    await depart(id, "2026-12-05");
    await depart(id, "2026-12-12", { priceQuadPaise: 549_900n });
    expect((await from(id)).get(id)).toBe(549_900);
  });

  it("is null with no departure ahead", async () => {
    const id = await aGroupTrip({ quad: 599_900 });
    await depart(id, "2026-11-01");
    expect((await from(id)).get(id)).toBeNull();
  });

  it("ignores a departure on a day no season covers and with no own price, and a child's place", async () => {
    const id = await aGroupTrip({ quad: 599_900, child_bed: 100_000 });
    await depart(id, "2027-03-01");
    expect((await from(id)).get(id)).toBeNull();
    await depart(id, "2026-12-05");
    expect((await from(id)).get(id)).toBe(599_900);
  });

  it("answers for several trips at once", async () => {
    const one = await aGroupTrip({ quad: 599_900 });
    const two = await aGroupTrip(null);
    await depart(one, "2026-12-05");
    const found = await from(one, two);
    expect([found.get(one), found.get(two)]).toEqual([599_900, null]);
  });
});
