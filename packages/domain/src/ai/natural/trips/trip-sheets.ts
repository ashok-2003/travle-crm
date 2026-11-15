// Reads the sellable group trips for the natural agent (spec 4.2), labelled T1… in the order given: owner text without
// payment details or contacts but with every number, priced rooms, seasons not yet ended, the next open departures and
// the files, in a fixed handful of reads whatever the number of trips. The package's internal name, its quote items
// and its payment details are never read.
import { withoutPaymentDetails } from "@travel-crm/contracts/ai";
import { quoteTaxRate, roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetailsByPackage } from "../../../departures/index.js";
import type { CalendarDate } from "../../../kernel/index.js";
import { fromPrices, packageFilesByPackage, seasonsByPackage } from "../../../quotes/index.js";
import { lowestAdultPrice, withoutContacts } from "../../lite/lookups/package-reads.js";
import type { PerPersonPrices, TripSheet } from "../types.js";

const MOST_DEPARTURES = 8;
const MOST_DAYS = 12;
const MOST_LINES = 6;

/** Cut before `most` characters at a word, so no number is ever cut in half. */
function cut(text: string, most: number): string {
  if (text.length <= most) return text;
  const head = text.slice(0, most - 1);
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

/** Owner text as the model may read it: no payment detail, email or handle; every number kept. */
const ownerText = (text: string, most: number) => cut(withoutContacts(withoutPaymentDetails(text)), most);

/** Owner text kept as separate lines (highlights, pickup points), each cut, six at most. */
const ownerLines = (lines: readonly string[]) =>
  lines
    .map((line) => ownerText(line, 100))
    .filter((line) => line !== "")
    .slice(0, MOST_LINES);

const textsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

function daysOf(value: unknown): TripSheet["days"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MOST_DAYS).flatMap((day: unknown) => {
    if (typeof day !== "object" || day === null) return [];
    const { title, description } = day as { title?: unknown; description?: unknown };
    if (typeof title !== "string") return [];
    return [{ title: ownerText(title, 80), text: typeof description === "string" ? ownerText(description, 160) : "" }];
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

export async function tripSheetsOf(
  tx: OrgTx,
  sellable: readonly { id: string; kind: string }[],
  today: CalendarDate,
  now: Date,
): Promise<TripSheet[]> {
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
      nights: row.nights,
      startCity: row.startCity,
      summary: ownerText(row.summary, 300),
      highlights: ownerLines(textsOf(row.highlights)),
      days: daysOf(row.days),
      pickups: ownerLines(row.pickupPoints.split("\n")),
      inclusions: ownerText(row.inclusions, 600),
      exclusions: ownerText(row.exclusions, 400),
      notes: ownerText(row.notes, 400),
      cancellation: ownerText(row.cancellationNotes, 400),
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
        // Prices a departure sets replace the season's on its date (`priceOn`).
        const own = pricedOnly(one.prices, rooms);
        const line = { id: one.id, startsOn: one.startsOn, freeSeats: one.freeSeats };
        return hasAny(own) ? { ...line, perPersonPaise: own } : line;
      }),
      fileIds: [...brochures, ...photos],
    };
  });
}
