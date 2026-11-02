// Supplier rates by season (release 7b): seasons of one supplier never overlap, a date with no season has no rate, the same
// item is found again in the season that covers another date, a season copied to next year changes every cost by a share and
// rounds to a rupee, and a rate is a number of paise only the people who keep suppliers change.
import type { SaveRateInput } from "@travel-crm/contracts/suppliers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupplier } from "../../src/suppliers/index.js";
import {
  changedCost,
  copySeason,
  deleteRate,
  deleteSeason,
  rateOnDate,
  ratesOnDate,
  saveRate,
  saveSeason,
  supplierRates,
} from "../../src/suppliers/index.js";
import { openWorld, type World } from "../bookings/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
const hotel = {
  kind: "hotel" as const,
  name: "",
  city: "",
  gstin: "",
  paymentTerms: "",
  paymentDetails: "",
  notes: "",
};
const room: Omit<SaveRateInput, "seasonId" | "costPaise"> = {
  item: "Deluxe room",
  mealPlan: "MAP",
  occupancy: "double",
  unit: "per_room_night",
  note: "",
};

describe("a supplier's rates by season", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Rates");
  });
  afterAll(async () => {
    await world.close();
  });

  const aSupplier = () =>
    world.inOrg((tx) => createSupplier(tx, world.manager, { ...hotel, name: `Hotel ${String((counter += 1))}` }));
  const season = (supplierId: string, label: string, startsOn: string, endsOn: string, seasonId?: string) =>
    world.inOrg((tx) =>
      saveSeason(tx, world.manager, { supplierId, label, startsOn, endsOn, ...(seasonId ? { seasonId } : {}) }),
    );
  const rate = (seasonId: string, costPaise: number, overrides: Partial<typeof room> = {}) =>
    world.inOrg((tx) => saveRate(tx, world.manager, { seasonId, ...room, ...overrides, costPaise }));

  it("keeps a supplier's seasons apart: an overlap is refused, a day beside one is not", async () => {
    const { id: supplierId } = await aSupplier();
    const peak = await season(supplierId, "Peak", "2026-12-01", "2027-01-15");
    expect(await reasonOf(season(supplierId, "Clash", "2027-01-15", "2027-02-01"))).toBe("SEASON_OVERLAPS");
    expect(await reasonOf(season(supplierId, "Inside", "2026-12-10", "2026-12-20"))).toBe("SEASON_OVERLAPS");
    await season(supplierId, "Winter", "2027-01-16", "2027-02-28");
    // A season changed to its own dates doesn't clash with itself.
    await season(supplierId, "Peak", "2026-12-01", "2027-01-14", peak.id);
    expect((await world.inOrg((tx) => supplierRates(tx, supplierId))).seasons.map((one) => one.label)).toEqual([
      "Peak",
      "Winter",
    ]);
  });

  it("lets another supplier use the same dates", async () => {
    const first = await aSupplier();
    const second = await aSupplier();
    await season(first.id, "Peak", "2026-12-01", "2027-01-15");
    await expect(season(second.id, "Peak", "2026-12-01", "2027-01-15")).resolves.toHaveProperty("id");
  });

  it("holds one rate for an item, meal plan, occupancy and unit in a season", async () => {
    const { id: supplierId } = await aSupplier();
    const peak = await season(supplierId, "Peak", "2026-12-01", "2027-01-15");
    await rate(peak.id, 350_000);
    expect(await reasonOf(rate(peak.id, 400_000))).toBe("RATE_ALREADY_EXISTS");
    await expect(rate(peak.id, 400_000, { occupancy: "triple" })).resolves.toHaveProperty("id");
  });

  it("has no rate for a date with no season, and finds the same item in the season that covers a date", async () => {
    const { id: supplierId } = await aSupplier();
    const peak = await season(supplierId, "Peak", "2026-12-01", "2027-01-15");
    const monsoon = await season(supplierId, "Monsoon", "2027-06-01", "2027-09-15");
    const peakRate = await rate(peak.id, 350_000);
    await rate(monsoon.id, 280_000);
    await rate(monsoon.id, 90_000, { item: "Extra bed" });
    const on = (rateId: string, day: string) => world.inOrg((tx) => rateOnDate(tx, rateId, day));
    expect((await on(peakRate.id, "2026-12-25"))?.costPaise).toBe(350_000);
    // The Monsoon season's own Deluxe room is found from the Peak rate that names it.
    const found = await on(peakRate.id, "2027-07-01");
    expect(found?.costPaise).toBe(280_000);
    expect(found?.seasonLabel).toBe("Monsoon");
    expect(await on(peakRate.id, "2027-04-01")).toBeNull();
    // An item the covering season lacks has no rate either.
    const extra = (await world.inOrg((tx) => supplierRates(tx, supplierId))).seasons
      .flatMap((one) => one.rates)
      .find((one) => one.item === "Extra bed");
    expect(extra).toBeDefined();
    expect(await on(extra?.id ?? "", "2026-12-25")).toBeNull();
    const listed = await world.inOrg((tx) => ratesOnDate(tx, supplierId, "2027-07-01"));
    expect(listed.season?.label).toBe("Monsoon");
    expect(listed.rates.map((one) => one.item).sort()).toEqual(["Deluxe room", "Extra bed"]);
    expect((await world.inOrg((tx) => ratesOnDate(tx, supplierId, "2027-04-01"))).season).toBeNull();
  });

  it("changes a cost by a share in basis points to the nearest rupee, in integer paise", () => {
    expect(changedCost(350_000n, 1000)).toBe(385_000n);
    expect(changedCost(333_300n, 500)).toBe(350_000n);
    expect(changedCost(100_050n, -1000)).toBe(90_000n);
    expect(changedCost(100_000n, 0)).toBe(100_000n);
    expect(changedCost(99n, 0)).toBe(100n);
  });

  it("copies a season to next year with every cost up by a share, and refuses dates already covered", async () => {
    const { id: supplierId } = await aSupplier();
    const peak = await season(supplierId, "Peak 2026", "2026-12-01", "2027-01-15");
    await rate(peak.id, 350_000);
    await rate(peak.id, 90_000, { item: "Extra bed" });
    const copy = await world.inOrg((tx) =>
      copySeason(tx, world.manager, {
        seasonId: peak.id,
        label: "Peak 2027",
        startsOn: "2027-12-01",
        endsOn: "2028-01-15",
        changeBasisPoints: 1000,
      }),
    );
    const seasons = (await world.inOrg((tx) => supplierRates(tx, supplierId))).seasons;
    const copied = seasons.find((one) => one.id === copy.id);
    expect(copied?.rates.map((one) => [one.item, one.costPaise]).sort()).toEqual([
      ["Deluxe room", 385_000],
      ["Extra bed", 99_000],
    ]);
    // The original is untouched.
    expect(
      seasons
        .find((one) => one.id === peak.id)
        ?.rates.map((one) => one.costPaise)
        .sort((a, b) => a - b),
    ).toEqual([90_000, 350_000]);
    // Dates already covered are refused, as for any season.
    const clash = world.inOrg((tx) =>
      copySeason(tx, world.manager, {
        seasonId: peak.id,
        label: "Again",
        startsOn: "2027-12-20",
        endsOn: "2028-02-01",
        changeBasisPoints: 0,
      }),
    );
    expect(await reasonOf(clash)).toBe("SEASON_OVERLAPS");
  });

  it("removes a rate and a season with its rates", async () => {
    const { id: supplierId } = await aSupplier();
    const peak = await season(supplierId, "Peak", "2026-12-01", "2027-01-15");
    const kept = await rate(peak.id, 350_000);
    const gone = await rate(peak.id, 90_000, { item: "Extra bed" });
    await world.inOrg((tx) => deleteRate(tx, world.manager, gone.id));
    expect((await world.inOrg((tx) => supplierRates(tx, supplierId))).seasons[0]?.rates).toHaveLength(1);
    await world.inOrg((tx) => deleteSeason(tx, world.manager, peak.id));
    expect((await world.inOrg((tx) => supplierRates(tx, supplierId))).seasons).toHaveLength(0);
    expect(await world.inOrg((tx) => rateOnDate(tx, kept.id, "2026-12-25"))).toBeNull();
  });
});
