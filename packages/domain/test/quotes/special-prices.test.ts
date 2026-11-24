// Special prices for some dates against the real database: the seasons around them are split, shortened or removed.
// one package (but free to repeat across packages), changed and removed with an audit entry each, and invisible to another agency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveSpecialPricesInput, type RoomPrices } from "@travel-crm/contracts/quotes";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";
import { createQuote, savePackage, savePackageSeason, saveSpecialPrices, seasonsOf } from "../../src/quotes/index.js";

const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const prices = (overrides: Partial<RoomPrices> = {}): RoomPrices => ({
  single: null,
  double: 4_500_000,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
  ...overrides,
});

describe("special prices", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Special prices");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aPackage(): Promise<string> {
    counter += 1;
    return world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title: `Trip ${String(counter)}`,
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
      return (await savePackage(tx, world.manager, { quoteId: quote.id, name: `Seasonal ${String(counter)}` })).id;
    });
  }
  const save = (packageId: string, label: string, startsOn: string, endsOn: string, seasonId?: string) =>
    world.inOrg((tx) =>
      savePackageSeason(tx, world.manager, {
        packageId,
        ...(seasonId === undefined ? {} : { seasonId }),
        label,
        startsOn,
        endsOn,
        prices: prices(),
      }),
    );

  const special = (packageId: string, startsOn: string, endsOn: string | null, price: Partial<RoomPrices> = {}) =>
    world.inOrg((tx) =>
      saveSpecialPrices(tx, world.manager, {
        packageId,
        label: "Special",
        startsOn,
        endsOn,
        prices: prices({ double: 9_900_000, ...price }),
      }),
    );
  const shape = async (id: string) =>
    (await world.inOrg((tx) => seasonsOf(tx, id))).map(
      (s) => `${s.label} ${s.startsOn}..${s.endsOn} ${String(s.prices.double)}`,
    );

  it("puts the period inside one season, keeping that season before and after it, with its prices", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-05-01", "2027-06-30");
    await special(id, "2027-06-01", "2027-06-10");
    expect(await shape(id)).toEqual([
      "Summer 2027-05-01..2027-05-31 4500000",
      "Special 2027-06-01..2027-06-10 9900000",
      "Summer 2027-06-11..2027-06-30 4500000",
    ]);
  });

  it("shortens a season that ends inside the period", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-05-01", "2027-06-10");
    await special(id, "2027-06-01", "2027-06-20");
    expect(await shape(id)).toEqual([
      "Summer 2027-05-01..2027-05-31 4500000",
      "Special 2027-06-01..2027-06-20 9900000",
    ]);
  });

  it("moves the start of a season that begins inside the period", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-06-10", "2027-06-30");
    await special(id, "2027-06-01", "2027-06-20");
    expect(await shape(id)).toEqual([
      "Special 2027-06-01..2027-06-20 9900000",
      "Summer 2027-06-21..2027-06-30 4500000",
    ]);
  });

  it("removes a season the period covers entirely", async () => {
    const id = await aPackage();
    await save(id, "Short", "2027-06-05", "2027-06-08");
    await special(id, "2027-06-01", "2027-06-20");
    expect(await shape(id)).toEqual(["Special 2027-06-01..2027-06-20 9900000"]);
  });

  it("starting on a season's first day and ending on its last replaces that season", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-06-01", "2027-06-30");
    await special(id, "2027-06-01", "2027-06-30");
    expect(await shape(id)).toEqual(["Special 2027-06-01..2027-06-30 9900000"]);
  });

  it("a period spanning two seasons trims both", async () => {
    const id = await aPackage();
    await save(id, "Early", "2027-05-01", "2027-05-31");
    await save(id, "Late", "2027-06-01", "2027-06-30");
    await special(id, "2027-05-20", "2027-06-10");
    expect(await shape(id)).toEqual([
      "Early 2027-05-01..2027-05-19 4500000",
      "Special 2027-05-20..2027-06-10 9900000",
      "Late 2027-06-11..2027-06-30 4500000",
    ]);
  });

  it("until I change them runs to the end of the season it splits", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-05-01", "2027-06-30");
    await special(id, "2027-06-01", null);
    expect(await shape(id)).toEqual([
      "Summer 2027-05-01..2027-05-31 4500000",
      "Special 2027-06-01..2027-06-30 9900000",
    ]);
  });

  it("until I change them with no season covering the start runs 365 days (start + 364)", async () => {
    const id = await aPackage();
    await special(id, "2027-01-01", null);
    expect(await shape(id)).toEqual(["Special 2027-01-01..2027-12-31 9900000"]);
  });

  it("until I change them with no season covering the start stops the day before the next season, which keeps its days and prices", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-04-01", "2027-06-30");
    await save(id, "Winter", "2028-01-10", "2028-01-31");
    await special(id, "2027-12-20", null);
    expect(await shape(id)).toEqual([
      "Summer 2027-04-01..2027-06-30 4500000",
      "Special 2027-12-20..2028-01-09 9900000",
      "Winter 2028-01-10..2028-01-31 4500000",
    ]);
  });

  it("a room type given no price stays unsold in the period", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-05-01", "2027-06-30");
    await special(id, "2027-06-01", "2027-06-10", { double: null, single: 5_000_000 });
    const [, middle] = await world.inOrg((tx) => seasonsOf(tx, id));
    expect(middle?.prices.double).toBeNull();
    expect(middle?.prices.single).toBe(5_000_000);
  });

  it("a refused period changes nothing", async () => {
    const id = await aPackage();
    await save(id, "Summer", "2027-05-01", "2027-06-30");
    const noPrice = { packageId: id, label: "Special", startsOn: "2027-06-01", endsOn: "2027-06-10" };
    expect(saveSpecialPricesInput.safeParse({ ...noPrice, prices: prices({ double: null }) }).success).toBe(false);
    // A failure after the writes, in the same transaction, takes them all back.
    await expect(
      world.inOrg(async (tx) => {
        await saveSpecialPrices(tx, world.manager, { ...noPrice, prices: prices({ double: 9_900_000 }) });
        throw new Error("refused later");
      }),
    ).rejects.toThrow("refused later");
    expect(await shape(id)).toEqual(["Summer 2027-05-01..2027-06-30 4500000"]);
  });
});
