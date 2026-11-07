// How a package is read: its columns and the lookup every package file shares, kept apart so the files that edit a package
// and the files that price one can both use it without importing each other.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

/** The refusal for a name a live package already has, shared by every place a package is named. */
export const nameTaken = () =>
  new DomainError("CONFLICT", "PACKAGE_NAME_TAKEN", "Another package already has this name");

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

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

export type PackageRow = NonNullable<Awaited<ReturnType<typeof readPackage>>>;
const readPackage = (tx: OrgTx, packageId: string) =>
  tx.quoteTemplate.findUnique({ where: { id: packageId }, select: packageColumns });

export async function findPackage(tx: OrgTx, packageId: string): Promise<PackageRow> {
  const row = await readPackage(tx, packageId);
  if (row === null) throw notFound();
  return row;
}
