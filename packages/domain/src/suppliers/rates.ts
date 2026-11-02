// Supplier rates (release 7b): what a supplier charges the agency, by season. Seasons of one supplier never overlap, so a date
// has at most one; a date with none has no rate and is never guessed. A rate is copied into a quote line when it is priced
// (a snapshot), so editing a rate later never changes a quote. Copying a season to next year changes every cost by a share.
import {
  supplierRateCatalog,
  type CopySeasonInput,
  type RatesOnDate,
  type SaveRateInput,
  type SaveSeasonInput,
  type SupplierRateCatalog,
} from "@travel-crm/contracts/suppliers";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const notFound = (what: string) => new DomainError("NOT_FOUND", "NOT_FOUND", `No such ${what}`);
const overlaps = () =>
  new DomainError("CONFLICT", "SEASON_OVERLAPS", "Another season of this supplier already covers some of these dates");
const rateTaken = () =>
  new DomainError(
    "CONFLICT",
    "RATE_ALREADY_EXISTS",
    "This season already has a rate for that item, meal plan and occupancy",
  );

const rateColumns = {
  id: true,
  item: true,
  mealPlan: true,
  occupancy: true,
  unit: true,
  costPaise: true,
  note: true,
} as const;

interface RateRow {
  id: string;
  item: string;
  mealPlan: string;
  occupancy: string;
  unit: string;
  costPaise: bigint;
  note: string;
}

export const rateView = (row: RateRow) => ({
  id: row.id,
  item: row.item,
  mealPlan: row.mealPlan,
  occupancy: row.occupancy,
  unit: row.unit,
  costPaise: Number(row.costPaise),
  note: row.note,
});

/** A supplier's seasons by date, each with its rates. */
export async function supplierRates(tx: OrgTx, supplierId: string): Promise<SupplierRateCatalog> {
  await requireSupplier(tx, supplierId);
  const seasons = await tx.supplierRateSeason.findMany({
    where: { supplierId },
    orderBy: [{ startsOn: "asc" }, { id: "asc" }],
    select: {
      id: true,
      label: true,
      startsOn: true,
      endsOn: true,
      rates: {
        orderBy: [{ item: "asc" }, { mealPlan: "asc" }, { occupancy: "asc" }, { id: "asc" }],
        select: rateColumns,
      },
    },
  });
  return supplierRateCatalog.parse({
    seasons: seasons.map((season) => ({
      id: season.id,
      label: season.label,
      startsOn: dayOf(season.startsOn),
      endsOn: dayOf(season.endsOn),
      rates: season.rates.map(rateView),
    })),
  });
}

async function requireSupplier(tx: OrgTx, supplierId: string): Promise<{ id: string; name: string }> {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (supplier === null) throw notFound("supplier");
  return supplier;
}

async function assertNoOverlap(
  tx: OrgTx,
  supplierId: string,
  range: { startsOn: string; endsOn: string },
  exceptId: string | null,
): Promise<void> {
  const clash = await tx.supplierRateSeason.findFirst({
    where: {
      supplierId,
      startsOn: { lte: asDate(range.endsOn) },
      endsOn: { gte: asDate(range.startsOn) },
      ...(exceptId === null ? {} : { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (clash !== null) throw overlaps();
}

/** The exclusion constraint is the last word when two people save overlapping seasons together. */
function overlapOnExclusionViolation(error: unknown): never {
  if (error instanceof Error && error.message.includes("supplier_rate_season_no_overlap")) throw overlaps();
  throw error;
}

export async function saveSeason(tx: OrgTx, access: MemberAccess, input: SaveSeasonInput): Promise<{ id: string }> {
  const supplier = await requireSupplier(tx, input.supplierId);
  const range = { startsOn: input.startsOn, endsOn: input.endsOn };
  await assertNoOverlap(tx, supplier.id, range, input.seasonId ?? null);
  const data = { label: input.label, startsOn: asDate(input.startsOn), endsOn: asDate(input.endsOn) };
  let id: string;
  if (input.seasonId === undefined) {
    id = (
      await tx.supplierRateSeason
        .create({ data: { supplierId: supplier.id, ...data, createdBy: access.userId }, select: { id: true } })
        .catch(overlapOnExclusionViolation)
    ).id;
  } else {
    const found = await tx.supplierRateSeason.findFirst({
      where: { id: input.seasonId, supplierId: supplier.id },
      select: { id: true },
    });
    if (found === null) throw notFound("season");
    id = found.id;
    await tx.supplierRateSeason.update({ where: { id }, data }).catch(overlapOnExclusionViolation);
  }
  await recordAudit(tx, access, {
    action: "supplier.season-saved",
    entityType: "supplier",
    entityId: supplier.id,
    after: { seasonId: id, label: input.label, startsOn: input.startsOn, endsOn: input.endsOn },
  });
  return { id };
}

export async function deleteSeason(tx: OrgTx, access: MemberAccess, seasonId: string): Promise<void> {
  const season = await tx.supplierRateSeason.findUnique({
    where: { id: seasonId },
    select: { id: true, supplierId: true, label: true },
  });
  if (season === null) throw notFound("season");
  await tx.supplierRate.deleteMany({ where: { seasonId: season.id } });
  await tx.supplierRateSeason.delete({ where: { id: season.id } });
  await recordAudit(tx, access, {
    action: "supplier.season-deleted",
    entityType: "supplier",
    entityId: season.supplierId,
    before: { seasonId: season.id, label: season.label },
  });
}

/** A cost changed by a share, in basis points, to the nearest whole rupee (integer paise throughout). */
export function changedCost(costPaise: bigint, changeBasisPoints: number): bigint {
  const scaled = costPaise * BigInt(10_000 + changeBasisPoints);
  const rupees = (scaled + 500_000n) / 1_000_000n;
  return rupees * 100n;
}

/** The season's rates copied to other dates (next year) with every cost changed by a share. */
export async function copySeason(tx: OrgTx, access: MemberAccess, input: CopySeasonInput): Promise<{ id: string }> {
  const source = await tx.supplierRateSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true, supplierId: true, rates: { select: { ...rateColumns } } },
  });
  if (source === null) throw notFound("season");
  await assertNoOverlap(tx, source.supplierId, input, null);
  const created = await tx.supplierRateSeason
    .create({
      data: {
        supplierId: source.supplierId,
        label: input.label,
        startsOn: asDate(input.startsOn),
        endsOn: asDate(input.endsOn),
        createdBy: access.userId,
      },
      select: { id: true },
    })
    .catch(overlapOnExclusionViolation);
  await tx.supplierRate.createMany({
    data: source.rates.map((rate) => ({
      seasonId: created.id,
      item: rate.item,
      mealPlan: rate.mealPlan,
      occupancy: rate.occupancy,
      unit: rate.unit,
      costPaise: input.changeBasisPoints === 0 ? rate.costPaise : changedCost(rate.costPaise, input.changeBasisPoints),
      note: rate.note,
    })),
  });
  await recordAudit(tx, access, {
    action: "supplier.season-copied",
    entityType: "supplier",
    entityId: source.supplierId,
    after: {
      seasonId: created.id,
      copiedFrom: source.id,
      rates: source.rates.length,
      changeBasisPoints: input.changeBasisPoints,
    },
  });
  return created;
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export async function saveRate(tx: OrgTx, access: MemberAccess, input: SaveRateInput): Promise<{ id: string }> {
  const season = await tx.supplierRateSeason.findUnique({
    where: { id: input.seasonId },
    select: { id: true, supplierId: true },
  });
  if (season === null) throw notFound("season");
  const fields = {
    item: input.item,
    mealPlan: input.mealPlan,
    occupancy: input.occupancy,
    unit: input.unit,
    costPaise: BigInt(input.costPaise),
    note: input.note,
  };
  let id: string;
  try {
    if (input.rateId === undefined) {
      id = (await tx.supplierRate.create({ data: { seasonId: season.id, ...fields }, select: { id: true } })).id;
    } else {
      const found = await tx.supplierRate.findFirst({
        where: { id: input.rateId, seasonId: season.id },
        select: { id: true },
      });
      if (found === null) throw notFound("rate");
      id = found.id;
      await tx.supplierRate.update({ where: { id }, data: fields });
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw rateTaken();
    throw error;
  }
  await recordAudit(tx, access, {
    action: "supplier.rate-saved",
    entityType: "supplier",
    entityId: season.supplierId,
    after: { rateId: id, item: input.item, costPaise: input.costPaise, unit: input.unit },
  });
  return { id };
}

export async function deleteRate(tx: OrgTx, access: MemberAccess, rateId: string): Promise<void> {
  const rate = await tx.supplierRate.findUnique({
    where: { id: rateId },
    select: { id: true, item: true, season: { select: { supplierId: true } } },
  });
  if (rate === null) throw notFound("rate");
  await tx.supplierRate.delete({ where: { id: rate.id } });
  await recordAudit(tx, access, {
    action: "supplier.rate-removed",
    entityType: "supplier",
    entityId: rate.season.supplierId,
    before: { rateId: rate.id, item: rate.item },
  });
}

/** The season of the supplier that covers the day, or null: no rate for that date. */
async function seasonOn(tx: OrgTx, supplierId: string, day: string) {
  return tx.supplierRateSeason.findFirst({
    where: { supplierId, startsOn: { lte: asDate(day) }, endsOn: { gte: asDate(day) } },
    select: { id: true, label: true },
  });
}

/** The rates a supplier has on a date, for the quote editor's picker. */
export async function ratesOnDate(tx: OrgTx, supplierId: string, day: string): Promise<RatesOnDate> {
  await requireSupplier(tx, supplierId);
  const season = await seasonOn(tx, supplierId, day);
  if (season === null) return { season: null, rates: [] };
  const rates = await tx.supplierRate.findMany({
    where: { seasonId: season.id },
    orderBy: [{ item: "asc" }, { mealPlan: "asc" }, { occupancy: "asc" }, { id: "asc" }],
    select: rateColumns,
  });
  return { season, rates: rates.map(rateView) as RatesOnDate["rates"] };
}

export interface RateOnDate {
  id: string;
  supplierName: string;
  item: string;
  mealPlan: string;
  occupancy: string;
  unit: string;
  costPaise: number;
  /** The season of the date; used to say what the line is for. */
  seasonLabel: string;
}

/**
 * The rate to use on a day for the rate a line or tier names: the same item, meal plan, occupancy and unit of the same
 * supplier in the season that covers the day. Null when the rate is gone, or the day has no season or no such rate there.
 */
export async function rateOnDate(tx: OrgTx, rateId: string, day: string): Promise<RateOnDate | null> {
  const named = await tx.supplierRate.findUnique({
    where: { id: rateId },
    select: {
      item: true,
      mealPlan: true,
      occupancy: true,
      unit: true,
      season: { select: { supplierId: true, supplier: { select: { name: true } } } },
    },
  });
  if (named === null) return null;
  const season = await seasonOn(tx, named.season.supplierId, day);
  if (season === null) return null;
  const rate = await tx.supplierRate.findFirst({
    where: {
      seasonId: season.id,
      item: named.item,
      mealPlan: named.mealPlan,
      occupancy: named.occupancy,
      unit: named.unit,
    },
    select: rateColumns,
  });
  if (rate === null) return null;
  return {
    id: rate.id,
    supplierName: named.season.supplier.name,
    item: rate.item,
    mealPlan: rate.mealPlan,
    occupancy: rate.occupancy,
    unit: rate.unit,
    costPaise: Number(rate.costPaise),
    seasonLabel: season.label,
  };
}
