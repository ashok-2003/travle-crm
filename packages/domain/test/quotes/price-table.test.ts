// The price table saved in one go: a column's pieces change together, other columns stay, rooms the trip stops selling lose
// their prices everywhere, and a column needs a price among the rooms sold.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { savePackageSeason, savePriceTable, seasonsOf } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const prices = (overrides: Partial<RoomPrices> = {}): RoomPrices => ({
  single: null,
  double: 4_500_000,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
  ...overrides,
});
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("savePriceTable", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Price table");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aTrip() {
    counter += 1;
    return world.inOrg(async (tx) => {
      const trip = await tx.quoteTemplate.create({
        data: { name: `Table ${String(counter)}`, title: "Table", kind: "group", roomTypes: ["single", "double"] },
        select: { id: true },
      });
      const season = async (label: string, startsOn: string, endsOn: string, own: RoomPrices) =>
        (
          await savePackageSeason(tx, world.manager, {
            packageId: trip.id,
            label,
            startsOn,
            endsOn,
            prices: own,
          })
        ).id;
      const regularA = await season("Regular", "2026-10-01", "2026-12-19", prices({ single: 6_000_000 }));
      const christmas = await season("Christmas", "2026-12-20", "2026-12-31", prices({ double: 9_000_000 }));
      const regularB = await season("Regular", "2027-01-01", "2027-03-31", prices({ single: 6_000_000 }));
      return { packageId: trip.id, regularA, regularB, christmas };
    });
  }

  it("changes both pieces of a column, leaves another alone, one audit entry per piece", async () => {
    const trip = await aTrip();
    await world.inOrg((tx) =>
      savePriceTable(tx, world.manager, {
        packageId: trip.packageId,
        roomTypes: ["single", "double"],
        columns: [
          {
            seasonIds: [trip.regularA, trip.regularB],
            label: "Regular",
            prices: prices({ single: 6_000_000, double: 5_000_000 }),
          },
        ],
      }),
    );
    const seasons = await world.inOrg((tx) => seasonsOf(tx, trip.packageId));
    expect(seasons.map((season) => season.prices.double)).toEqual([5_000_000, 9_000_000, 5_000_000]);
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { entityId: trip.packageId, action: "package.season-saved" } }),
    );
    // Three pieces saved when made, two more by the table.
    expect(audit).toBe(5);
  });

  it("refuses a season of another trip as not found", async () => {
    const trip = await aTrip();
    const another = await aTrip();
    const reason = await reasonOf(
      world.inOrg((tx) =>
        savePriceTable(tx, world.manager, {
          packageId: trip.packageId,
          roomTypes: ["double"],
          columns: [{ seasonIds: [another.regularA], label: "Regular", prices: prices() }],
        }),
      ),
    );
    expect(reason).toBe("NOT_FOUND");
  });

  it("drops a room type from every season and saves the room types", async () => {
    const trip = await aTrip();
    await world.inOrg((tx) =>
      savePriceTable(tx, world.manager, {
        packageId: trip.packageId,
        roomTypes: ["double"],
        columns: [{ seasonIds: [trip.christmas], label: "Christmas", prices: prices({ double: 9_500_000 }) }],
      }),
    );
    const seasons = await world.inOrg((tx) => seasonsOf(tx, trip.packageId));
    expect(seasons.every((season) => season.prices.single === null)).toBe(true);
    const stored = await world.inOrg((tx) =>
      tx.quoteTemplate.findUniqueOrThrow({ where: { id: trip.packageId }, select: { roomTypes: true } }),
    );
    expect(stored.roomTypes).toEqual(["double"]);
  });

  it("refuses a column with no price among the room types sold", async () => {
    const trip = await aTrip();
    const reason = await reasonOf(
      world.inOrg((tx) =>
        savePriceTable(tx, world.manager, {
          packageId: trip.packageId,
          roomTypes: ["double"],
          columns: [{ seasonIds: [trip.regularA], label: "Regular", prices: prices({ double: null, single: 1 }) }],
        }),
      ),
    );
    expect(reason).toBe("PRICE_TABLE_COLUMN_UNPRICED");
  });
});
