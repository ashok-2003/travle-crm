// Saving one section of a trip against the real database: the part's fields change, every other field stays as stored, and
// the full save's checks (a taken address, a missing "from" price) still run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UpdatePackageInput, UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { findPackage, mergePackagePart, updatePackage } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("saving one section of a trip", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Package part");
  });
  afterAll(async () => {
    await world.close();
  });

  const aPackage = (name: string, slug: string | null = null) =>
    world.inOrg(async (tx) => {
      const row = await tx.quoteTemplate.create({
        data: {
          name,
          title: `${name} title`,
          kind: "group",
          slug,
          nights: 5,
          summary: "Old summary",
          highlights: ["Lake"],
          startCity: "Delhi",
          weeklyDays: [5],
          seatsPerDeparture: 12,
          advancePerPersonPaise: 500_000n,
        },
        select: { id: true },
      });
      return row.id;
    });
  const savePart = (part: UpdatePackagePartInput) =>
    world.inOrg(async (tx) => {
      const input: UpdatePackageInput = mergePackagePart(await findPackage(tx, part.packageId), part);
      await updatePackage(tx, world.manager, input);
    });

  it("saves only the given fields and keeps every other field as stored", async () => {
    const id = await aPackage("Spiti part");
    await savePart({ packageId: id, summary: "New summary" });
    const row = await world.inOrg((tx) => findPackage(tx, id));
    expect(row.summary).toBe("New summary");
    expect(row.title).toBe("Spiti part title");
    expect(row.highlights).toEqual(["Lake"]);
    expect(row.startCity).toBe("Delhi");
    expect(row.weeklyDays).toEqual([5]);
    expect(row.seatsPerDeparture).toBe(12);
    expect(row.nights).toBe(5);
    expect(row.advancePerPersonPaise).toBe(500_000n);
  });

  it("can set a field to null", async () => {
    const id = await aPackage("Null part");
    await savePart({ packageId: id, nights: null });
    expect((await world.inOrg((tx) => findPackage(tx, id))).nights).toBeNull();
  });

  it("runs a full save's checks: a taken slug and a custom trip's missing from-price are refused", async () => {
    await aPackage("Slug owner", "taken-address");
    const id = await aPackage("Checked part");
    expect(await reasonOf(savePart({ packageId: id, slug: "taken-address" }))).toBe("PACKAGE_SLUG_TAKEN");
    // A custom trip needs the amount it shows; a group trip's is worked out.
    expect(await reasonOf(savePart({ packageId: id, kind: "custom", priceDisplay: "from" }))).toBe(
      "FROM_PRICE_REQUIRED",
    );
    expect(await reasonOf(savePart({ packageId: id, priceDisplay: "from" }))).toBeNull();
    expect((await world.inOrg((tx) => findPackage(tx, id))).slug).toBeNull();
  });
});
