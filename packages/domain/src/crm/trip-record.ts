// A trip as crm's rows hold it and as the contracts carry it: the travel columns of a lead or a repeat enquiry turned
// into `when`, the one-line summary (lists, Today) and the whole trip (the lead page, an export). One copy for every
// crm read: the lead list and the lead page map their rows through these too.
import {
  budgetBasis,
  foodPreference,
  hotelCategory,
  tripType,
  type TravelWhen,
  type TripDetail,
  type TripSummary,
} from "@travel-crm/contracts/crm";

/** A stored calendar day, as "2026-11-14". */
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** A lead's or a repeat enquiry's travel columns. */
export interface TravelColumns {
  travelKind: string;
  travelStart: Date | null;
  travelEnd: Date | null;
  travelMonth: Date | null;
}

/** When they travel, from the row's columns (CHECK lead_travel_fits_kind keeps them consistent). */
export function travelWhenOf(row: TravelColumns): TravelWhen {
  if (row.travelKind === "dates" && row.travelStart !== null && row.travelEnd !== null) {
    return { kind: "dates", from: dayOf(row.travelStart), to: dayOf(row.travelEnd) };
  }
  if (row.travelKind === "month" && row.travelMonth !== null) {
    return { kind: "month", month: dayOf(row.travelMonth).slice(0, 7) };
  }
  return { kind: row.travelKind === "flexible" ? "flexible" : "unknown" };
}

/** The columns a trip summary reads, as a Prisma select of a lead or an enquiry. */
export const tripSummaryColumns = {
  destination: { select: { name: true } },
  travelKind: true,
  travelStart: true,
  travelEnd: true,
  travelMonth: true,
  adults: true,
  childrenAges: true,
} as const;

/** "Kashmir · Dec · 2 adults, 1 child", as data. */
export function tripSummaryOf(
  row: TravelColumns & { destination: { name: string } | null; adults: number | null; childrenAges: number[] },
): TripSummary {
  return {
    destinationName: row.destination?.name ?? null,
    when: travelWhenOf(row),
    adults: row.adults,
    childrenCount: row.childrenAges.length,
  };
}

/** The columns a whole trip reads, as a Prisma select of a lead or an enquiry. */
export const tripDetailColumns = {
  ...tripSummaryColumns,
  destination: { select: { id: true, name: true } },
  budgetPaise: true,
  budgetBasis: true,
  departureCity: true,
  tripType: true,
  hotelCategory: true,
  food: true,
  roomType: true,
} as const;

export interface TripDetailColumns extends TravelColumns {
  destination: { id: string; name: string } | null;
  adults: number | null;
  childrenAges: number[];
  budgetPaise: bigint | null;
  budgetBasis: string | null;
  departureCity: string | null;
  tripType: string | null;
  hotelCategory: string | null;
  food: string | null;
  roomType: string | null;
}

/** The whole trip, as the lead page shows it: the budget in paise (at most ₹100 crore, so a number is exact). */
export function tripDetailOf(row: TripDetailColumns): TripDetail {
  return {
    destination: row.destination,
    when: travelWhenOf(row),
    adults: row.adults,
    childrenAges: row.childrenAges,
    budget:
      row.budgetPaise === null || row.budgetBasis === null
        ? null
        : {
            amount: { amountPaise: Number(row.budgetPaise), currency: "INR" },
            basis: budgetBasis.parse(row.budgetBasis),
          },
    departureCity: row.departureCity,
    tripType: tripType.nullable().parse(row.tripType),
    hotelCategory: hotelCategory.nullable().parse(row.hotelCategory),
    food: foodPreference.nullable().parse(row.food),
    roomType: row.roomType,
  };
}
