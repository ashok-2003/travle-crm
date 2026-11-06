// The departures a public package page lists (release 7b): upcoming, not cancelled or closed, past no cut-off, at the package's
// destination, each with a word (Open, Filling fast, Full) and never a seat count. Also the one departure a visitor may join.
import type { PublicSeatWord } from "@travel-crm/contracts/package-pages";
import type { OrgTx } from "@travel-crm/db";
import { adultRoomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import { parseCalendarDate } from "../kernel/index.js";
import { departurePriceColumn, priceOn, seasonsOf } from "../quotes/index.js";
import { asDate, countsOf, dayOf, departureSettingsOf, seatsSoldAndHeld, stateOf } from "./rows.js";

export interface PublicDepartureRow {
  id: string;
  destinationId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  word: PublicSeatWord;
  pricePaise: number | null;
}

const MOST_LISTED = 12;

/** The words a visitor reads; staff seat counts stay with staff. */
const wordOf = (state: string): PublicSeatWord | null =>
  state === "open" || state === "filling" || state === "full" ? state : null;

/**
 * Upcoming departures that still take seats or a waitlist, the next first. A group package lists only its own, each priced
 * by its season or its own prices (the lowest an adult pays), even when that leaves none; any other package lists the ones at its
 * destination that belong to no package.
 */
export async function publicDepartures(
  tx: OrgTx,
  input: { destinationId: string | null; packageId?: string; today: string; now: Date },
): Promise<PublicDepartureRow[]> {
  const group =
    input.packageId === undefined
      ? null
      : await tx.quoteTemplate.findUnique({ where: { id: input.packageId }, select: { kind: true, roomTypes: true } });
  const pricing =
    group?.kind === "group" && input.packageId !== undefined
      ? await pricingOf(tx, input.packageId, group.roomTypes as RoomType[])
      : null;
  if (pricing === null && input.destinationId === null) return [];
  const scope =
    pricing !== null && input.packageId !== undefined
      ? { templateId: input.packageId }
      : // A custom package lists the free-standing departures at its destination, never another package's batches.
        { destinationId: input.destinationId, templateId: null };
  const rows = await tx.departure.findMany({
    where: {
      status: "open",
      startDate: { gte: asDate(input.today) },
      OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDate(input.today) } }],
      ...scope,
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: MOST_LISTED,
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      seatsTotal: true,
      pricePaise: true,
      status: true,
      destinationId: true,
      priceSinglePaise: true,
      priceDoublePaise: true,
      priceTriplePaise: true,
      priceQuadPaise: true,
      priceChildBedPaise: true,
      priceChildNoBedPaise: true,
    },
  });
  const [seats, settings] = await Promise.all([
    seatsSoldAndHeld(
      tx,
      rows.map((row) => row.id),
      input.now,
    ),
    departureSettingsOf(tx),
  ]);
  return rows.flatMap((row) => {
    const counts = countsOf(row.seatsTotal, seats.get(row.id)?.sold ?? 0, seats.get(row.id)?.held ?? 0);
    const word = wordOf(stateOf(row, counts, settings.fillingFastPercent));
    return word === null
      ? []
      : [
          {
            id: row.id,
            destinationId: row.destinationId,
            title: row.title,
            startDate: dayOf(row.startDate),
            endDate: dayOf(row.endDate),
            word,
            pricePaise: pricing === null ? (row.pricePaise === null ? null : Number(row.pricePaise)) : pricing(row),
          },
        ];
  });
}

/** The package's seasons and offered room types, as a function from a departure to its lowest offered price. */
export async function pricingOf(tx: OrgTx, packageId: string, offered: readonly RoomType[]) {
  const seasons = await seasonsOf(tx, packageId);
  return (row: {
    title: string;
    startDate: Date;
    priceSinglePaise: bigint | null;
    priceDoublePaise: bigint | null;
    priceTriplePaise: bigint | null;
    priceQuadPaise: bigint | null;
    priceChildBedPaise: bigint | null;
    priceChildNoBedPaise: bigint | null;
  }): number | null => {
    const own = (type: RoomType) => {
      const value = row[departurePriceColumn[type]];
      return value === null ? null : Number(value);
    };
    const priced = priceOn(
      parseCalendarDate(dayOf(row.startDate)),
      seasons,
      {
        title: row.title,
        prices: {
          single: own("single"),
          double: own("double"),
          triple: own("triple"),
          quad: own("quad"),
          child_bed: own("child_bed"),
          child_no_bed: own("child_no_bed"),
        },
      },
      offered,
    );
    // "From" is the lowest an adult pays: a child's place is cheaper by design and is never "the" price.
    const given = adultRoomTypes.flatMap((type) => {
      const price = priced?.prices[type] ?? null;
      return price === null ? [] : [price];
    });
    return given.length === 0 ? null : Math.min(...given);
  };
}
