// Reads the sellable group trips for the natural agent (spec 4.2), labelled T1… in the order given: owner text without
// payment details or contacts but with every number, priced rooms, seasons not yet ended, the next open departures and
// the files, in a fixed handful of reads whatever the number of trips. The package's internal name, its quote items
// and its payment details are never read. The prompt's sheets cut long owner text to their budget; get_trip's are whole.
import { withoutPaymentDetails } from "@travel-crm/contracts/ai";
import { quoteTaxRate, roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetailsByPackage } from "../../../departures/index.js";
import type { CalendarDate } from "../../../kernel/index.js";
import { fromPrices, packageFilesByPackage, priceOn, seasonsByPackage } from "../../../quotes/index.js";
import { lowestAdultPrice, strings, withoutContacts } from "../../lite/lookups/package-reads.js";
import type { PackageIndexEntry } from "../../lite/types.js";
import { cutText } from "../context/tokens.js";
import type { PerPersonPrices, TripSheet } from "../types.js";

/** How many open departures a sheet lists (spec 4.2); find_trips with a month and quote read past them. */
export const MOST_DEPARTURES = 8;

/**
 * How much owner text a sheet keeps: days, lines, and characters of each part. A sheet in the prompt is cut to its token
 * budget; a trip read whole (get_trip) keeps everything, so no fact of the owner's is out of the model's reach.
 */
function textLimits(cut: boolean) {
  const most = (inPrompt: number) => (cut ? inPrompt : Number.POSITIVE_INFINITY);
  return {
    days: most(12),
    lines: most(6),
    line: most(100),
    dayTitle: most(80),
    dayText: most(160),
    summary: most(300),
    inclusions: most(600),
    exclusions: most(400),
    notes: most(400),
    cancellation: most(400),
  };
}
type TextLimits = ReturnType<typeof textLimits>;

/** Owner text as the model may read it: no payment detail, email or handle; every number kept. */
const ownerText = (text: string, most: number) => cutText(withoutContacts(withoutPaymentDetails(text)), most);

/** Owner text kept as separate lines (highlights, pickup points), each cut. */
const ownerLines = (lines: readonly string[], limits: TextLimits) =>
  lines
    .map((line) => ownerText(line, limits.line))
    .filter((line) => line !== "")
    .slice(0, limits.lines);

function daysOf(value: unknown, limits: TextLimits): TripSheet["days"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limits.days).flatMap((day: unknown) => {
    if (typeof day !== "object" || day === null) return [];
    const { title, description } = day as { title?: unknown; description?: unknown };
    if (typeof title !== "string") return [];
    const text = typeof description === "string" ? ownerText(description, limits.dayText) : "";
    return [{ title: ownerText(title, limits.dayTitle), text }];
  });
}

/** The prices these room types have, in the room types' own order. */
function pricedOnly(prices: RoomPrices, rooms: readonly RoomType[]): PerPersonPrices {
  const priced: PerPersonPrices = {};
  for (const type of rooms) {
    const price = prices[type];
    if (price !== null) priced[type] = price;
  }
  return priced;
}

const hasAny = (prices: PerPersonPrices) => Object.keys(prices).length > 0;

/** A trip as lite's `findPackages` reads it: the one mapping, for the turn block, the lookups and the actions. */
export function indexEntryOf(sheet: TripSheet): PackageIndexEntry {
  const { packageId, title, place, nights, startCity } = sheet;
  return { id: packageId, title, place, destinationId: null, nights, startCity };
}

export async function tripSheetsOf(
  tx: OrgTx,
  sellable: readonly { id: string; kind: string }[],
  today: CalendarDate,
  now: Date,
  options: { whole?: boolean } = {},
): Promise<TripSheet[]> {
  const limits = textLimits(options.whole !== true);
  const ids = sellable.filter((one) => one.kind === "group").map((one) => one.id);
  if (ids.length === 0) return [];
  const [rows, departures, seasons, files] = await Promise.all([
    tx.quoteTemplate.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        nights: true,
        startCity: true,
        summary: true,
        highlights: true,
        days: true,
        pickupPoints: true,
        inclusions: true,
        exclusions: true,
        notes: true,
        cancellationNotes: true,
        roomTypes: true,
        pricesIncludeGst: true,
        taxRateBasisPoints: true,
        advancePerPersonPaise: true,
        destinationId: true,
        destination: { select: { name: true } },
      },
    }),
    openDepartureDetailsByPackage(tx, ids, today, now),
    seasonsByPackage(tx, ids),
    packageFilesByPackage(tx, ids),
  ]);
  const found = ids.flatMap((id) => rows.filter((row) => row.id === id));
  return found.map((row, index) => {
    const offered = roomTypes.filter((type) => row.roomTypes.includes(type));
    // A departure leaving today can no longer be offered.
    const open = (departures.get(row.id) ?? []).filter((one) => one.startsOn > today);
    const ownSeasons = seasons.get(row.id) ?? [];
    const lowest = fromPrices(
      ownSeasons,
      open.map((one) => one.prices),
      today,
      offered,
    );
    const rooms = offered.filter((type) => lowest[type] !== null);
    const { brochures = [], photos = [] } = files.get(row.id) ?? {};
    return {
      label: `T${String(index + 1)}`,
      packageId: row.id,
      title: row.title,
      place: row.destination?.name ?? null,
      destinationId: row.destinationId,
      nights: row.nights,
      startCity: row.startCity,
      summary: ownerText(row.summary, limits.summary),
      highlights: ownerLines(strings(row.highlights), limits),
      days: daysOf(row.days, limits),
      pickups: ownerLines(row.pickupPoints.split("\n"), limits),
      inclusions: ownerText(row.inclusions, limits.inclusions),
      exclusions: ownerText(row.exclusions, limits.exclusions),
      notes: ownerText(row.notes, limits.notes),
      cancellation: ownerText(row.cancellationNotes, limits.cancellation),
      rooms,
      seasons: ownSeasons
        .filter((season) => season.endsOn >= today)
        .map((season) => ({
          name: season.label,
          from: season.startsOn,
          until: season.endsOn,
          perPersonPaise: pricedOnly(season.prices, rooms),
        }))
        .filter((season) => hasAny(season.perPersonPaise)),
      pricesIncludeGst: row.pricesIncludeGst,
      taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
      fromPaise: lowestAdultPrice(ownSeasons, open, today, offered),
      advancePerPersonPaise: row.advancePerPersonPaise === null ? null : Number(row.advancePerPersonPaise),
      departures: open.slice(0, MOST_DEPARTURES).map((one) => {
        // The quote's own rule, so the sheet never gives a date a price the quote would refuse or change.
        const priced = priceOn(one.startsOn, ownSeasons, one, offered);
        const perPersonPaise = priced === null ? {} : pricedOnly(priced.prices, offered);
        const priceFrom = priced === null || !hasAny(perPersonPaise) ? ("none" as const) : priced.source;
        return { id: one.id, startsOn: one.startsOn, freeSeats: one.freeSeats, priceFrom, perPersonPaise };
      }),
      fileIds: [...brochures, ...photos],
    };
  });
}
