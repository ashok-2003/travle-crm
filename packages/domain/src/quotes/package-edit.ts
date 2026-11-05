// Editing a package (release 7b): its words for the public page, its tiers, and publishing the page. A package is a quote
// template with a name; publishing is outward-facing, so it needs a name, an address (slug), a summary and a photo, and
// whoever holds settings:manage does it. The address is unique among live packages. Tiers hold lines priced from rates when
// a quote is made, never now.
import {
  packageDetail,
  MAX_TIERS,
  packageTier,
  tierLine,
  type PackageDetail,
  type PublishGap,
  type SellGap,
  type SetPackageSellableInput,
  type RoomType,
  type SaveTierInput,
  type UpdatePackageInput,
} from "@travel-crm/contracts/quotes";
import { isUniqueViolation, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { CalendarDate } from "../kernel/index.js";
import { withoutCosts } from "./margin.js";
import { seasonsOf } from "./package-seasons.js";
import { itemsOf } from "./quote-rows.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
const nameTaken = () => new DomainError("CONFLICT", "PACKAGE_NAME_TAKEN", "Another package already has this name");
const slugTaken = () => new DomainError("CONFLICT", "PACKAGE_SLUG_TAKEN", "Another package already has this address");

export const packageColumns = {
  id: true,
  name: true,
  title: true,
  days: true,
  items: true,
  inclusions: true,
  exclusions: true,
  notes: true,
  taxRateBasisPoints: true,
  slug: true,
  destinationId: true,
  nights: true,
  summary: true,
  highlights: true,
  priceDisplay: true,
  fromPricePaise: true,
  published: true,
  defaultTravellerLevel: true,
  cancellationNotes: true,
  kind: true,
  roomTypes: true,
  pricesIncludeGst: true,
  advancePerPersonPaise: true,
  paymentDetails: true,
  pickupPoints: true,
  startCity: true,
  weeklyDays: true,
  departureMonths: true,
  seatsPerDeparture: true,
  aiSellable: true,
  destination: { select: { name: true } },
} as const;

type PackageRow = NonNullable<Awaited<ReturnType<typeof readPackage>>>;
const readPackage = (tx: OrgTx, packageId: string) =>
  tx.quoteTemplate.findUnique({ where: { id: packageId }, select: packageColumns });

export async function findPackage(tx: OrgTx, packageId: string): Promise<PackageRow> {
  const row = await readPackage(tx, packageId);
  if (row === null) throw notFound();
  return row;
}

/** What a package still lacks before its page can be published. */
export function publishGaps(row: Pick<PackageRow, "name" | "slug" | "summary">, photoCount: number): PublishGap[] {
  const gaps: PublishGap[] = [];
  if (row.name.trim() === "") gaps.push("name");
  if (row.slug === null) gaps.push("slug");
  if (row.summary.trim() === "") gaps.push("summary");
  if (photoCount < 1) gaps.push("photo");
  return gaps;
}

/** The package's tiers in order, each line with the name of the rate it prices from (a rate since removed has none). */
export async function tiersOf(tx: OrgTx, packageId: string) {
  const tiers = (
    await tx.quoteTemplateTier.findMany({
      where: { templateId: packageId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, name: true, position: true, lines: true },
    })
  ).map((tier) => ({ ...tier, lines: tierLine.array().catch([]).parse(tier.lines) }));
  const rateIds = [
    ...new Set(tiers.flatMap((tier) => tier.lines.flatMap((line) => (line.rateId === null ? [] : [line.rateId])))),
  ];
  const rates = await tx.supplierRate.findMany({
    where: { id: { in: rateIds } },
    select: { id: true, item: true, season: { select: { supplier: { select: { name: true } } } } },
  });
  const labels = new Map(rates.map((rate) => [rate.id, `${rate.season.supplier.name}: ${rate.item}`]));
  return tiers.map((tier) =>
    packageTier.parse({
      ...tier,
      lines: tier.lines.map((line) => ({
        ...line,
        rateLabel: line.rateId === null ? null : (labels.get(line.rateId) ?? null),
      })),
    }),
  );
}

/** The package for its editor. Costs in its lines are shown only to whoever may see margins. */
/** The departures of a group package that can still be sold from today: open, not past their cut-off. */
const sellableDepartures = (tx: OrgTx, packageId: string, today: CalendarDate) =>
  tx.departure.findMany({
    where: {
      templateId: packageId,
      status: "open",
      startDate: { gte: asDay(today) },
      OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDay(today) } }],
    },
    select: {
      priceSinglePaise: true,
      priceDoublePaise: true,
      priceTriplePaise: true,
      priceQuadPaise: true,
      priceChildBedPaise: true,
      priceChildNoBedPaise: true,
    },
  });
const asDay = (day: CalendarDate) => new Date(`${day}T00:00:00Z`);

/** The departure column holding the price of each room type. */
export const departurePriceColumn = {
  single: "priceSinglePaise",
  double: "priceDoublePaise",
  triple: "priceTriplePaise",
  quad: "priceQuadPaise",
  child_bed: "priceChildBedPaise",
  child_no_bed: "priceChildNoBedPaise",
} as const;

/** What a package still needs before the AI may sell it, in the order the editor shows them. */
export async function packageSellGaps(tx: OrgTx, packageId: string, today: CalendarDate): Promise<SellGap[]> {
  const row = await findPackage(tx, packageId);
  if (row.kind !== "group") return row.fromPricePaise === null ? ["from_price"] : [];
  const gaps: SellGap[] = [];
  const offered = row.roomTypes as RoomType[];
  if (offered.length === 0) gaps.push("room_types");
  const departures = await sellableDepartures(tx, packageId, today);
  const seasonPriced = (await seasonsOf(tx, packageId)).some(
    (season) => season.endsOn >= today && offered.some((type) => season.prices[type] !== null),
  );
  const departurePriced = departures.some((departure) =>
    offered.some((type) => departure[departurePriceColumn[type]] !== null),
  );
  if (!seasonPriced && !departurePriced) gaps.push("prices");
  if (row.advancePerPersonPaise === null || row.advancePerPersonPaise <= 0n) gaps.push("advance");
  if (departures.length === 0) gaps.push("departures");
  return gaps;
}

/** Lets the AI sell the package, or stops it. Turning on needs nothing missing; turning off always works. */
export async function setPackageSellable(
  tx: OrgTx,
  access: MemberAccess,
  input: SetPackageSellableInput,
  today: CalendarDate,
): Promise<void> {
  const row = await findPackage(tx, input.packageId);
  if (row.aiSellable === input.sellable) return;
  if (input.sellable && (await packageSellGaps(tx, row.id, today)).length > 0) {
    throw new DomainError("VALIDATION", "PACKAGE_NOT_READY_TO_SELL", "Fill in what the package still needs first");
  }
  await tx.quoteTemplate.update({ where: { id: row.id }, data: { aiSellable: input.sellable } });
  await recordAudit(tx, access, {
    action: "package.sellable-changed",
    entityType: "quote_template",
    entityId: row.id,
    before: { sellable: row.aiSellable },
    after: { sellable: input.sellable, name: row.name },
  });
}

export async function getPackage(
  tx: OrgTx,
  access: MemberAccess,
  packageId: string,
  context: { photoCount: number; agencyCode: string; today: CalendarDate },
): Promise<PackageDetail> {
  const row = await findPackage(tx, packageId);
  const settings = await tx.publicPageSettings.findFirst({ select: { enabled: true } });
  const items = itemsOf(row);
  return packageDetail.parse({
    id: row.id,
    name: row.name,
    title: row.title,
    days: row.days,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    notes: row.notes,
    taxRateBasisPoints: row.taxRateBasisPoints,
    slug: row.slug,
    destinationId: row.destinationId,
    nights: row.nights,
    summary: row.summary,
    highlights: row.highlights,
    priceDisplay: row.priceDisplay,
    fromPricePaise: row.fromPricePaise === null ? null : Number(row.fromPricePaise),
    defaultTravellerLevel: row.defaultTravellerLevel,
    cancellationNotes: row.cancellationNotes,
    kind: row.kind,
    roomTypes: row.roomTypes,
    pricesIncludeGst: row.pricesIncludeGst,
    advancePerPersonPaise: row.advancePerPersonPaise === null ? null : Number(row.advancePerPersonPaise),
    paymentDetails: row.paymentDetails,
    pickupPoints: row.pickupPoints,
    startCity: row.startCity,
    weeklyDays: row.weeklyDays,
    departureMonths: row.departureMonths,
    seatsPerDeparture: row.seatsPerDeparture,
    sellable: row.aiSellable,
    sellGaps: await packageSellGaps(tx, row.id, context.today),
    published: row.published,
    destinationName: row.destination?.name ?? null,
    items: access.permissions.has("money:view_margin") ? items : withoutCosts(items),
    tiers: await tiersOf(tx, row.id),
    seasons: await seasonsOf(tx, row.id),
    photoCount: context.photoCount,
    gaps: publishGaps(row, context.photoCount),
    pagesEnabled: settings?.enabled ?? false,
    agencyCode: context.agencyCode,
  });
}

export async function updatePackage(tx: OrgTx, access: MemberAccess, input: UpdatePackageInput): Promise<void> {
  const before = await findPackage(tx, input.packageId);
  const { packageId, ...fields } = input;
  if (fields.priceDisplay === "from" && fields.fromPricePaise === null) {
    throw new DomainError("VALIDATION", "FROM_PRICE_REQUIRED", "Enter the price to show, or choose 'Price on enquiry'");
  }
  if (before.published && fields.slug === null) {
    throw new DomainError(
      "CONFLICT",
      "PACKAGE_PUBLISHED_NEEDS_SLUG",
      "Unpublish the page before you remove its address",
    );
  }
  if (
    fields.destinationId !== null &&
    (await tx.destination.findUnique({ where: { id: fields.destinationId } })) === null
  ) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such destination");
  }
  if (
    (await tx.quoteTemplate.findFirst({
      where: { name: fields.name, id: { not: packageId } },
      select: { id: true },
    })) !== null
  ) {
    throw nameTaken();
  }
  if (
    fields.slug !== null &&
    (await tx.quoteTemplate.findFirst({
      where: { slug: fields.slug, id: { not: packageId } },
      select: { id: true },
    })) !== null
  ) {
    throw slugTaken();
  }
  try {
    await tx.quoteTemplate.update({
      where: { id: packageId },
      data: {
        ...fields,
        fromPricePaise: fields.fromPricePaise === null ? null : BigInt(fields.fromPricePaise),
        advancePerPersonPaise: fields.advancePerPersonPaise === null ? null : BigInt(fields.advancePerPersonPaise),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = JSON.stringify((error as { meta?: unknown }).meta ?? "");
      throw target.includes("slug") ? slugTaken() : nameTaken();
    }
    throw error;
  }
  await recordAudit(tx, access, {
    action: "quote-package.changed",
    entityType: "quote_template",
    entityId: packageId,
    before: { name: before.name, slug: before.slug },
    after: { name: fields.name, slug: fields.slug },
  });
}

/** Switches the package's public page on or off. Publishing needs everything the page shows. */
export async function setPackagePublished(
  tx: OrgTx,
  access: MemberAccess,
  input: { packageId: string; published: boolean },
  photoCount: number,
): Promise<void> {
  const row = await findPackage(tx, input.packageId);
  if (row.published === input.published) return;
  if (input.published && publishGaps(row, photoCount).length > 0) {
    throw new DomainError(
      "CONFLICT",
      "PACKAGE_NOT_READY",
      "Give the package a name, an address, a summary and a photo first",
    );
  }
  await tx.quoteTemplate.update({ where: { id: row.id }, data: { published: input.published } });
  const audited = { entityType: "quote_template", entityId: row.id, after: { name: row.name, slug: row.slug } };
  if (input.published) await recordAudit(tx, access, { action: "quote-package.published", ...audited });
  else await recordAudit(tx, access, { action: "quote-package.unpublished", ...audited });
}

/** Adds a tier, or changes one: its name and its lines. */
export async function saveTier(tx: OrgTx, access: MemberAccess, input: SaveTierInput): Promise<{ id: string }> {
  const row = await findPackage(tx, input.packageId);
  const fields = { name: input.name, lines: input.lines };
  let id: string;
  try {
    if (input.tierId === undefined) {
      const position = await tx.quoteTemplateTier.count({ where: { templateId: row.id } });
      if (position >= MAX_TIERS) {
        throw new DomainError("LIMIT_REACHED", "PACKAGE_TIER_LIMIT", "A package has five tiers at most");
      }
      id = (
        await tx.quoteTemplateTier.create({ data: { templateId: row.id, position, ...fields }, select: { id: true } })
      ).id;
    } else {
      const found = await tx.quoteTemplateTier.findFirst({
        where: { id: input.tierId, templateId: row.id },
        select: { id: true },
      });
      if (found === null) throw notFound();
      id = found.id;
      await tx.quoteTemplateTier.update({ where: { id }, data: fields });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "TIER_NAME_TAKEN", "This package already has a tier with this name");
    }
    throw error;
  }
  await recordAudit(tx, access, {
    action: "quote-package.tier-saved",
    entityType: "quote_template",
    entityId: row.id,
    after: { tierId: id, name: input.name, lines: input.lines.length },
  });
  return { id };
}

export async function removeTier(tx: OrgTx, access: MemberAccess, tierId: string): Promise<void> {
  const tier = await tx.quoteTemplateTier.findUnique({
    where: { id: tierId },
    select: { id: true, name: true, templateId: true },
  });
  if (tier === null) throw notFound();
  await tx.quoteTemplateTier.delete({ where: { id: tier.id } });
  await recordAudit(tx, access, {
    action: "quote-package.tier-removed",
    entityType: "quote_template",
    entityId: tier.templateId,
    before: { tierId: tier.id, name: tier.name },
  });
}
