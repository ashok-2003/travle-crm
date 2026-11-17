// A group package's seasons: dates with per-person room prices. Seasons of one package never overlap (checked first for a
// clear answer, and by the database's exclusion constraint when two people save together). Rows are deleted for real.
import type { SavePackageSeasonInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, parseCalendarDate } from "../kernel/index.js";
import { findPackage } from "./package-row.js";
import type { SeasonPrices } from "./room-prices.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (date: Date) => parseCalendarDate(date.toISOString().slice(0, 10));
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
const overlaps = () =>
  new DomainError(
    "CONFLICT",
    "PACKAGE_SEASON_OVERLAPS",
    "Another season of this package already covers some of these dates",
  );

const seasonColumns = {
  id: true,
  label: true,
  startsOn: true,
  endsOn: true,
  priceSinglePaise: true,
  priceDoublePaise: true,
  priceTriplePaise: true,
  priceQuadPaise: true,
  priceChildBedPaise: true,
  priceChildNoBedPaise: true,
} as const;

interface SeasonRow {
  id: string;
  label: string;
  startsOn: Date;
  endsOn: Date;
  priceSinglePaise: bigint | null;
  priceDoublePaise: bigint | null;
  priceTriplePaise: bigint | null;
  priceQuadPaise: bigint | null;
  priceChildBedPaise: bigint | null;
  priceChildNoBedPaise: bigint | null;
}

const num = (value: bigint | null) => (value === null ? null : Number(value));
const big = (value: number | null) => (value === null ? null : BigInt(value));

function viewOf(row: SeasonRow): SeasonPrices & { id: string } {
  return {
    id: row.id,
    label: row.label,
    startsOn: dayOf(row.startsOn),
    endsOn: dayOf(row.endsOn),
    prices: {
      single: num(row.priceSinglePaise),
      double: num(row.priceDoublePaise),
      triple: num(row.priceTriplePaise),
      quad: num(row.priceQuadPaise),
      child_bed: num(row.priceChildBedPaise),
      child_no_bed: num(row.priceChildNoBedPaise),
    },
  };
}

/** The package's seasons, earliest first. */
export async function seasonsOf(tx: OrgTx, packageId: string): Promise<(SeasonPrices & { id: string })[]> {
  const rows = await tx.packageSeason.findMany({
    where: { templateId: packageId },
    orderBy: [{ startsOn: "asc" }, { id: "asc" }],
    select: seasonColumns,
  });
  return rows.map(viewOf);
}

/** The seasons of each of these packages, earliest first, in one query (a package with none has an empty list). */
export async function seasonsByPackage(
  tx: OrgTx,
  packageIds: readonly string[],
): Promise<Map<string, (SeasonPrices & { id: string })[]>> {
  const found = new Map<string, (SeasonPrices & { id: string })[]>(packageIds.map((id) => [id, []]));
  if (packageIds.length === 0) return found;
  const rows = await tx.packageSeason.findMany({
    where: { templateId: { in: [...packageIds] } },
    orderBy: [{ startsOn: "asc" }, { id: "asc" }],
    select: { ...seasonColumns, templateId: true },
  });
  for (const row of rows) found.get(row.templateId)?.push(viewOf(row));
  return found;
}

/** The exclusion constraint is the last word when two people save overlapping seasons together. */
function overlapOnExclusionViolation(error: unknown): never {
  if (error instanceof Error && error.message.includes("package_season_no_overlap")) throw overlaps();
  throw error;
}

const auditedOf = (season: SeasonPrices & { id: string }) => ({
  seasonId: season.id,
  label: season.label,
  startsOn: season.startsOn,
  endsOn: season.endsOn,
  ...season.prices,
});

export async function savePackageSeason(
  tx: OrgTx,
  access: MemberAccess,
  input: SavePackageSeasonInput,
): Promise<{ id: string }> {
  const template = await findPackage(tx, input.packageId);
  const clash = await tx.packageSeason.findFirst({
    where: {
      templateId: template.id,
      startsOn: { lte: asDate(input.endsOn) },
      endsOn: { gte: asDate(input.startsOn) },
      ...(input.seasonId === undefined ? {} : { id: { not: input.seasonId } }),
    },
    select: { id: true },
  });
  if (clash !== null) throw overlaps();
  const { prices } = input;
  const data = {
    label: input.label,
    startsOn: asDate(input.startsOn),
    endsOn: asDate(input.endsOn),
    priceSinglePaise: big(prices.single),
    priceDoublePaise: big(prices.double),
    priceTriplePaise: big(prices.triple),
    priceQuadPaise: big(prices.quad),
    priceChildBedPaise: big(prices.child_bed),
    priceChildNoBedPaise: big(prices.child_no_bed),
  };
  let id: string;
  let before: SeasonRow | null = null;
  if (input.seasonId === undefined) {
    id = (
      await tx.packageSeason
        .create({ data: { templateId: template.id, ...data, createdBy: access.userId }, select: { id: true } })
        .catch(overlapOnExclusionViolation)
    ).id;
  } else {
    before = await tx.packageSeason.findFirst({
      where: { id: input.seasonId, templateId: template.id },
      select: seasonColumns,
    });
    if (before === null) throw notFound();
    id = before.id;
    await tx.packageSeason.update({ where: { id }, data }).catch(overlapOnExclusionViolation);
  }
  await recordAudit(tx, access, {
    action: "package.season-saved",
    entityType: "quote_template",
    entityId: template.id,
    ...(before === null ? {} : { before: auditedOf(viewOf(before)) }),
    after: auditedOf({
      id,
      label: input.label,
      startsOn: parseCalendarDate(input.startsOn),
      endsOn: parseCalendarDate(input.endsOn),
      prices,
    }),
  });
  return { id };
}

export async function removePackageSeason(tx: OrgTx, access: MemberAccess, seasonId: string): Promise<void> {
  const season = await tx.packageSeason.findUnique({
    where: { id: seasonId },
    select: { ...seasonColumns, templateId: true },
  });
  if (season === null) throw notFound();
  await tx.packageSeason.delete({ where: { id: season.id } });
  await recordAudit(tx, access, {
    action: "package.season-removed",
    entityType: "quote_template",
    entityId: season.templateId,
    before: auditedOf(viewOf(season)),
  });
}
