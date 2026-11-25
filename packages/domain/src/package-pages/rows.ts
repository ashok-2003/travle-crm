// The shape of a published package as the public readers hold it, with its stored JSON read safely.
import { quoteDay } from "@travel-crm/contracts/quotes";

export interface PublicPackageRow {
  id: string;
  name: string;
  slug: string;
  summary: string;
  nights: number | null;
  destinationId: string | null;
  destinationName: string | null;
  highlights: string[];
  days: { title: string; description: string }[];
  inclusions: string;
  exclusions: string;
  cancellationNotes: string;
  /** Null for "Price on enquiry". */
  fromPricePaise: number | null;
}

const highlightList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];

/** A group trip's "From" is the one worked out from its departures (`groupFromPrices`), shown unless it chose "Price on enquiry". */
export function highlightsOf(
  row: {
    id: string;
    kind: string;
    name: string;
    slug: string | null;
    summary: string;
    nights: number | null;
    destinationId: string | null;
    highlights: unknown;
    days: unknown;
    inclusions: string;
    exclusions: string;
    cancellationNotes: string;
    priceDisplay: string;
    fromPricePaise: bigint | null;
    destination: { name: string } | null;
  },
  groupFrom: number | null = null,
): PublicPackageRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? "",
    summary: row.summary,
    nights: row.nights,
    destinationId: row.destinationId,
    destinationName: row.destination?.name ?? null,
    highlights: highlightList(row.highlights),
    days: quoteDay.array().catch([]).parse(row.days),
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    cancellationNotes: row.cancellationNotes,
    fromPricePaise:
      row.kind === "group"
        ? row.priceDisplay === "from"
          ? groupFrom
          : null
        : row.priceDisplay === "from" && row.fromPricePaise !== null
          ? Number(row.fromPricePaise)
          : null,
  };
}
