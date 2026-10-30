// The AI's use of a lead's empty trip fields (release ai2a, feature 3): a new WhatsApp lead is filled in from the customer's own
// opening messages, but only where the lead holds nothing yet; a value a person gave is never overwritten. The same fields are
// cleared again when a person dismisses the suggestion, and only while they still hold what the AI wrote. Plain column writes in
// the caller's transaction; the audit and the suggestion rows are the ai module's.
import type { Budget, TravelWhen, TripType, HotelCategory, FoodPreference } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { tripColumns, travelWhenOf, budgetOf } from "./trip-columns.js";

/** The lead fields a suggestion may fill, named as the suggestion rows name them. */
export type GapField =
  | "destination"
  | "when"
  | "adults"
  | "children_ages"
  | "budget"
  | "departure_city"
  | "trip_type"
  | "hotel_category"
  | "food"
  | "room_type";

export interface TripGaps {
  destinationId?: string;
  when?: TravelWhen;
  adults?: number;
  childrenAges?: number[];
  budget?: Budget;
  departureCity?: string;
  tripType?: TripType;
  hotelCategory?: HotelCategory;
  food?: FoodPreference;
  roomType?: string;
}

const select = {
  id: true,
  destinationId: true,
  travelKind: true,
  travelStart: true,
  travelEnd: true,
  travelMonth: true,
  adults: true,
  childrenAges: true,
  budgetPaise: true,
  budgetBasis: true,
  departureCity: true,
  tripType: true,
  hotelCategory: true,
  food: true,
  roomType: true,
} as const;

/** Writes the suggested values into the lead's empty fields, except those skipped; returns the fields it wrote. */
export async function fillTripGaps(
  tx: OrgTx,
  leadId: string,
  gaps: TripGaps,
  skip: ReadonlySet<GapField> = new Set(),
): Promise<GapField[]> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select });
  if (lead === null) return [];
  const written: GapField[] = [];
  const data: Record<string, unknown> = {};
  const take = (field: GapField, empty: boolean, columns: Record<string, unknown>) => {
    if (!empty || skip.has(field)) return;
    Object.assign(data, columns);
    written.push(field);
  };
  if (gaps.destinationId !== undefined)
    take("destination", lead.destinationId === null, { destinationId: gaps.destinationId });
  if (gaps.when !== undefined) {
    const { travelKind, travelStart, travelEnd, travelMonth } = tripColumns({
      destinationId: null,
      when: gaps.when,
      adults: null,
      childrenAges: [],
      budget: null,
      departureCity: null,
      tripType: null,
      hotelCategory: null,
      food: null,
      roomType: null,
    });
    take("when", lead.travelKind === "unknown", { travelKind, travelStart, travelEnd, travelMonth });
  }
  if (gaps.adults !== undefined) take("adults", lead.adults === null, { adults: gaps.adults });
  if (gaps.childrenAges !== undefined) {
    take("children_ages", lead.childrenAges.length === 0, { childrenAges: gaps.childrenAges });
  }
  if (gaps.budget !== undefined) {
    take("budget", lead.budgetPaise === null, {
      budgetPaise: BigInt(gaps.budget.amount.amountPaise),
      budgetBasis: gaps.budget.basis,
    });
  }
  if (gaps.departureCity !== undefined)
    take("departure_city", lead.departureCity === null, { departureCity: gaps.departureCity });
  if (gaps.tripType !== undefined) take("trip_type", lead.tripType === null, { tripType: gaps.tripType });
  if (gaps.hotelCategory !== undefined)
    take("hotel_category", lead.hotelCategory === null, { hotelCategory: gaps.hotelCategory });
  if (gaps.food !== undefined) take("food", lead.food === null, { food: gaps.food });
  if (gaps.roomType !== undefined) take("room_type", lead.roomType === null, { roomType: gaps.roomType });
  if (written.length > 0) await tx.lead.update({ where: { id: leadId }, data });
  return written;
}

/** The lead's trip fields as the suggestion rows name them: null where the lead holds nothing. */
export async function tripFieldValues(tx: OrgTx, leadId: string): Promise<Record<GapField, unknown> | null> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select });
  if (lead === null) return null;
  const when = travelWhenOf(lead);
  return {
    destination: lead.destinationId === null ? null : { kind: "existing", destinationId: lead.destinationId },
    when: when.kind === "unknown" ? null : when,
    adults: lead.adults,
    children_ages: lead.childrenAges.length === 0 ? null : lead.childrenAges,
    budget: budgetOf(lead),
    departure_city: lead.departureCity,
    trip_type: lead.tripType,
    hotel_category: lead.hotelCategory,
    food: lead.food,
    room_type: lead.roomType,
  };
}

const emptied: Record<GapField, Record<string, unknown>> = {
  destination: { destinationId: null },
  when: { travelKind: "unknown", travelStart: null, travelEnd: null, travelMonth: null },
  adults: { adults: null },
  children_ages: { childrenAges: [] },
  budget: { budgetPaise: null, budgetBasis: null },
  departure_city: { departureCity: null },
  trip_type: { tripType: null },
  hotel_category: { hotelCategory: null },
  food: { food: null },
  room_type: { roomType: null },
};

/** Empties these fields of the lead (a dismissed suggestion's), and only these. */
export async function clearTripFields(tx: OrgTx, leadId: string, fields: readonly GapField[]): Promise<void> {
  if (fields.length === 0) return;
  await tx.lead.update({
    where: { id: leadId },
    data: Object.assign({}, ...fields.map((field) => emptied[field])) as Record<string, unknown>,
  });
}
