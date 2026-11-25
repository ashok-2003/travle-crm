// A package's destination typed as a new name (the package editor's 'Add "Spiti"'), against the real database: saving
// finds the agency's destination of that name whatever its case, or adds it once and audits it; a refused save adds none.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UpdatePackageInput } from "@travel-crm/contracts/quotes";
import { findOrAddDestination } from "../../src/catalog/index.js";
import { createPackage, findPackage, updatePackage } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const words = (name: string, overrides: Partial<UpdatePackageInput> = {}): Omit<UpdatePackageInput, "packageId"> => ({
  name,
  title: name,
  days: [],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  slug: null,
  destinationId: null,
  nights: null,
  summary: "",
  highlights: [],
  priceDisplay: "on_enquiry",
  fromPricePaise: null,
  defaultTravellerLevel: null,
  cancellationNotes: "",
  kind: "group",
  roomTypes: [],
  pricesIncludeGst: true,
  advancePerPersonPaise: null,
  pickupPoints: "",
  startCity: "",
  weeklyDays: [],
  departureMonths: [],
  seatsPerDeparture: null,
  ...overrides,
});

describe("a package's new destination", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Package destinations");
  });
  afterAll(async () => {
    await world.close();
  });

  /** Makes a package and saves it with these changes; gives its id and the destination it was saved with. */
  async function saved(changes: Partial<UpdatePackageInput>) {
    counter += 1;
    const name = `Group trip ${String(counter)}`;
    return world.inOrg(async (tx) => {
      const { id } = await createPackage(tx, world.manager, { name, kind: "group" });
      await updatePackage(tx, world.manager, { packageId: id, ...words(name, changes) });
      return { id, destinationId: (await findPackage(tx, id)).destinationId };
    });
  }

  const named = (name: string) =>
    world.inOrg((tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM destination WHERE lower(name) = lower(${name})`.then((rows) =>
        rows.map((row) => row.id),
      ),
    );

  it("adds one the agency hasn't got, audited, and saving the name again gives the same one", async () => {
    const first = await saved({ newDestinationName: "  Spiti   Valley " });
    expect(await named("Spiti Valley")).toEqual([first.destinationId]);
    const second = await saved({ newDestinationName: "spiti valley" });
    expect(second.destinationId).toBe(first.destinationId);
    expect(await named("Spiti Valley")).toEqual([first.destinationId]);
    const added = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { action: "destination.added" },
        select: { entityId: true, actorUserId: true },
      }),
    );
    expect(added.filter((entry) => entry.entityId === first.destinationId)).toEqual([
      { entityId: first.destinationId, actorUserId: world.manager.userId },
    ]);
  });

  it("uses the agency's own destination of that name, whatever its case", async () => {
    const kedarnath = await world.inOrg((tx) => findOrAddDestination(tx, world.manager, "Kedarnath"));
    expect((await saved({ newDestinationName: "KEDARNATH" })).destinationId).toBe(kedarnath.id);
    expect(await named("Kedarnath")).toEqual([kedarnath.id]);
  });

  it("adds none when the save is refused", async () => {
    await expect(saved({ newDestinationName: "Chopta", kind: "custom", priceDisplay: "from" })).rejects.toMatchObject({
      reason: "FROM_PRICE_REQUIRED",
    });
    expect(await named("Chopta")).toEqual([]);
  });
});
