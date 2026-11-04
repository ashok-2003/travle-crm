// A group package's seasons against the real database, under row-level security: kept in date order, never overlapping within
// one package (but free to repeat across packages), changed and removed with an audit entry each, and invisible to another agency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";
import {
  createQuote,
  getPackage,
  removePackageSeason,
  savePackage,
  savePackageSeason,
  seasonsOf,
} from "../../src/quotes/index.js";

const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
const prices = (overrides: Partial<RoomPrices> = {}): RoomPrices => ({
  single: null,
  double: 4_500_000,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
  ...overrides,
});

describe("package seasons", () => {
  let world: World;
  let other: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Seasons");
    other = await openWorld("Seasons elsewhere");
  });
  afterAll(async () => {
    await world.close();
    await other.close();
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

  it("saves seasons in date order, and refuses one that overlaps", async () => {
    const id = await aPackage();
    await save(id, "December", "2026-12-01", "2026-12-31");
    await save(id, "November", "2026-11-01", "2026-11-30");
    const seasons = await world.inOrg((tx) => seasonsOf(tx, id));
    expect(seasons.map((season) => season.label)).toEqual(["November", "December"]);
    expect(seasons[0]?.prices.double).toBe(4_500_000);
    expect(await reasonOf(save(id, "Clash", "2026-11-25", "2026-12-05"))).toBe("PACKAGE_SEASON_OVERLAPS");
    const detail = await world.inOrg((tx) =>
      getPackage(tx, world.manager, id, {
        photoCount: 0,
        agencyCode: "seasons",
        today: parseCalendarDate("2026-11-10"),
      }),
    );
    expect(detail.seasons).toHaveLength(2);
    const another = await aPackage();
    await expect(save(another, "November", "2026-11-25", "2026-12-05")).resolves.toHaveProperty("id");
  });

  it("changes and removes a season, each audited", async () => {
    const id = await aPackage();
    const season = await save(id, "Autumn", "2026-10-01", "2026-10-31");
    expect(await reasonOf(save(id, "Wrong", "2026-09-01", "2026-09-30", "00000000-0000-7000-8000-000000000000"))).toBe(
      "NOT_FOUND",
    );
    await save(id, "Autumn sale", "2026-10-05", "2026-10-31", season.id);
    expect((await world.inOrg((tx) => seasonsOf(tx, id))).map((one) => one.label)).toEqual(["Autumn sale"]);
    await world.inOrg((tx) => removePackageSeason(tx, world.manager, season.id));
    expect(await world.inOrg((tx) => seasonsOf(tx, id))).toEqual([]);
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { entityId: id, action: { startsWith: "package.season-" } },
        select: { action: true },
      }),
    );
    expect(audit.map((entry) => entry.action).sort()).toEqual([
      "package.season-removed",
      "package.season-saved",
      "package.season-saved",
    ]);
  });

  it("another agency's season is not found", async () => {
    const id = await aPackage();
    const season = await save(id, "Winter", "2027-01-01", "2027-01-31");
    expect(await reasonOf(other.inOrg((tx) => removePackageSeason(tx, other.manager, season.id)))).toBe("NOT_FOUND");
    expect(
      await reasonOf(
        other.inOrg((tx) =>
          savePackageSeason(tx, other.manager, {
            packageId: id,
            label: "Hijack",
            startsOn: "2027-02-01",
            endsOn: "2027-02-28",
            prices: prices(),
          }),
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(await world.inOrg((tx) => seasonsOf(tx, id))).toHaveLength(1);
  });
});
