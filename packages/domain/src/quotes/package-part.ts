// Saving one section of a trip: the fields a part names are put over the stored package, so a full save's checks still run.
import { updatePackageInput, type UpdatePackageInput, type UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import type { PackageRow } from "./package-row.js";

/** The stored package as a full save's input, with the part's fields over it. */
export function mergePackagePart(before: PackageRow, part: UpdatePackagePartInput): UpdatePackageInput {
  const { packageId, ...named } = part;
  const stored = {
    packageId,
    name: before.name,
    title: before.title,
    days: before.days,
    inclusions: before.inclusions,
    exclusions: before.exclusions,
    notes: before.notes,
    taxRateBasisPoints: before.taxRateBasisPoints,
    slug: before.slug,
    destinationId: before.destinationId,
    nights: before.nights,
    summary: before.summary,
    highlights: before.highlights,
    priceDisplay: before.priceDisplay,
    fromPricePaise: before.fromPricePaise === null ? null : Number(before.fromPricePaise),
    defaultTravellerLevel: before.defaultTravellerLevel,
    cancellationNotes: before.cancellationNotes,
    kind: before.kind,
    roomTypes: before.roomTypes,
    pricesIncludeGst: before.pricesIncludeGst,
    advancePerPersonPaise: before.advancePerPersonPaise === null ? null : Number(before.advancePerPersonPaise),
    pickupPoints: before.pickupPoints,
    startCity: before.startCity,
    weeklyDays: before.weeklyDays,
    departureMonths: before.departureMonths,
    seatsPerDeparture: before.seatsPerDeparture,
  };
  const given = Object.fromEntries(Object.entries(named).filter(([, value]) => value !== undefined));
  // A new destination's name replaces the stored destination, as in a full save.
  const destination = named.newDestinationName === undefined ? {} : { destinationId: null };
  return updatePackageInput.parse({ ...stored, ...given, ...destination });
}
