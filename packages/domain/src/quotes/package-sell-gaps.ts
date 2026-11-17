// What a package still needs before the AI may sell it, and the packages it may sell today. The list is read in a fixed
// handful of queries whatever the number of packages (the packages, their departures, their seasons, the agency's payment
// details): the AI's turn asks it every time, against a database a round trip away.
import type { RoomType, SellGap } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { agencyPaymentDetailsOf, paymentDetailsReady } from "../profile/index.js";
import type { CalendarDate } from "../kernel/index.js";
import { findPackage } from "./package-row.js";
import { seasonsByPackage } from "./package-seasons.js";
import type { SeasonPrices } from "./room-prices.js";

/** The departure column holding the price of each room type. */
export const departurePriceColumn = {
  single: "priceSinglePaise",
  double: "priceDoublePaise",
  triple: "priceTriplePaise",
  quad: "priceQuadPaise",
  child_bed: "priceChildBedPaise",
  child_no_bed: "priceChildNoBedPaise",
} as const;

type DeparturePrices = Record<(typeof departurePriceColumn)[RoomType], bigint | null>;

interface SellRow {
  id: string;
  kind: string;
  fromPricePaise: bigint | null;
  roomTypes: unknown;
  advancePerPersonPaise: bigint | null;
}

const asDay = (day: CalendarDate) => new Date(`${day}T00:00:00Z`);
const sellColumns = {
  id: true,
  kind: true,
  fromPricePaise: true,
  roomTypes: true,
  advancePerPersonPaise: true,
} as const;

/** The departures of these group packages that can still be sold from today (open, not past their cut-off), by package. */
async function sellableDepartures(
  tx: OrgTx,
  packageIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, DeparturePrices[]>> {
  const found = new Map<string, DeparturePrices[]>(packageIds.map((id) => [id, []]));
  if (packageIds.length === 0) return found;
  const rows = await tx.departure.findMany({
    where: {
      templateId: { in: [...packageIds] },
      status: "open",
      startDate: { gte: asDay(today) },
      OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDay(today) } }],
    },
    select: {
      templateId: true,
      priceSinglePaise: true,
      priceDoublePaise: true,
      priceTriplePaise: true,
      priceQuadPaise: true,
      priceChildBedPaise: true,
      priceChildNoBedPaise: true,
    },
  });
  for (const { templateId, ...prices } of rows) if (templateId !== null) found.get(templateId)?.push(prices);
  return found;
}

/** The gaps of one package from what was read of it, in the order the editor shows them. */
function gapsOf(
  row: SellRow,
  read: { departures: readonly DeparturePrices[]; seasons: readonly SeasonPrices[] },
  today: CalendarDate,
  paymentReady: boolean,
): SellGap[] {
  if (row.kind !== "group") return row.fromPricePaise === null ? ["from_price"] : [];
  const gaps: SellGap[] = [];
  const offered = row.roomTypes as RoomType[];
  if (offered.length === 0) gaps.push("room_types");
  const seasonPriced = read.seasons.some(
    (season) => season.endsOn >= today && offered.some((type) => season.prices[type] !== null),
  );
  const departurePriced = read.departures.some((departure) =>
    offered.some((type) => departure[departurePriceColumn[type]] !== null),
  );
  if (!seasonPriced && !departurePriced) gaps.push("prices");
  if (row.advancePerPersonPaise === null || row.advancePerPersonPaise <= 0n) gaps.push("advance");
  if (read.departures.length === 0) gaps.push("departures");
  // The agent asks the customer to pay the advance, so it needs somewhere to say where.
  if (!paymentReady) gaps.push("payment_details");
  return gaps;
}

/** Each of these packages with its gaps, read in one query per table. */
async function gapsOfRows(
  tx: OrgTx,
  rows: readonly SellRow[],
  today: CalendarDate,
  paymentReady: boolean,
): Promise<{ row: SellRow; gaps: SellGap[] }[]> {
  const groups = rows.filter((row) => row.kind === "group").map((row) => row.id);
  const departures = await sellableDepartures(tx, groups, today);
  const seasons = await seasonsByPackage(tx, groups);
  return rows.map((row) => ({
    row,
    gaps: gapsOf(
      row,
      { departures: departures.get(row.id) ?? [], seasons: seasons.get(row.id) ?? [] },
      today,
      paymentReady,
    ),
  }));
}

/** What a package still needs before the AI may sell it, in the order the editor shows them. */
export async function packageSellGaps(
  tx: OrgTx,
  organizationId: string,
  packageId: string,
  today: CalendarDate,
): Promise<SellGap[]> {
  const row = await findPackage(tx, packageId);
  const paymentReady = paymentDetailsReady(await agencyPaymentDetailsOf(tx, organizationId));
  const [checked] = await gapsOfRows(tx, [row], today, paymentReady);
  return checked?.gaps ?? [];
}

/**
 * The packages the AI may sell today: switched on, and with nothing missing. The only way to ask (a package that has lost
 * its seasons or departures since the switch was turned on is not offered), so callers never read the switch alone.
 */
export async function sellablePackages(
  tx: OrgTx,
  organizationId: string,
  today: CalendarDate,
): Promise<{ id: string; kind: string }[]> {
  const switchedOn = await tx.quoteTemplate.findMany({
    where: { aiSellable: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: sellColumns,
  });
  if (switchedOn.length === 0) return [];
  const paymentReady = paymentDetailsReady(await agencyPaymentDetailsOf(tx, organizationId));
  return (await gapsOfRows(tx, switchedOn, today, paymentReady))
    .filter((one) => one.gaps.length === 0)
    .map(({ row }) => ({ id: row.id, kind: row.kind }));
}

/**
 * The packages the AI could sell today but for the agency's payment QR: switched on, with nothing of their own missing.
 * For the prompts that name the agency's trips and quote no money (Suggest reply, the score): an agency still setting
 * up its payment has trips all the same.
 */
export async function packagesOnOffer(tx: OrgTx, today: CalendarDate): Promise<{ id: string; kind: string }[]> {
  const switchedOn = await tx.quoteTemplate.findMany({
    where: { aiSellable: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: sellColumns,
  });
  if (switchedOn.length === 0) return [];
  return (await gapsOfRows(tx, switchedOn, today, true))
    .filter((one) => one.gaps.length === 0)
    .map(({ row }) => ({ id: row.id, kind: row.kind }));
}

/**
 * How many group packages are switched on and would be sellable but for the agency's missing payment details: what the
 * setup checklist's "packages" line needs to say "add payment details" instead of "mark a package". 0 once they exist.
 */
export async function packagesAwaitingPayment(tx: OrgTx, organizationId: string, today: CalendarDate): Promise<number> {
  if (paymentDetailsReady(await agencyPaymentDetailsOf(tx, organizationId))) return 0;
  const switchedOn = await tx.quoteTemplate.findMany({
    where: { aiSellable: true, kind: "group" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: sellColumns,
  });
  return (await gapsOfRows(tx, switchedOn, today, true)).filter((one) => one.gaps.length === 0).length;
}

/** The one package, when the AI may sell it today: what a booking checks of the package it books, and no other. */
export async function sellablePackage(
  tx: OrgTx,
  organizationId: string,
  packageId: string,
  today: CalendarDate,
): Promise<{ id: string; kind: string } | null> {
  const row = await tx.quoteTemplate.findFirst({ where: { id: packageId, aiSellable: true }, select: sellColumns });
  if (row === null) return null;
  const paymentReady = paymentDetailsReady(await agencyPaymentDetailsOf(tx, organizationId));
  const [checked] = await gapsOfRows(tx, [row], today, paymentReady);
  return checked?.gaps.length === 0 ? { id: row.id, kind: row.kind } : null;
}
