// What a save wrote, at the paths a fill proposes, so recordFillApplied can tell which applied values the member then changed.
// A path the form left empty is absent or null.
import type { FillPath } from "@travel-crm/contracts/ai";
import type { CreateLeadInput, LogCallInput, TripInput } from "@travel-crm/contracts/crm";
import type { UpdateQuoteInput } from "@travel-crm/contracts/quotes";

export type SavedValues = Partial<Record<FillPath, unknown>>;

export function tripSaved(trip: TripInput): SavedValues {
  return {
    "trip.destination": trip.destination,
    "trip.when": trip.when,
    "trip.adults": trip.adults,
    "trip.childrenAges": trip.childrenAges.length === 0 ? null : trip.childrenAges,
    "trip.budget": trip.budget,
    "trip.departureCity": trip.departureCity,
    "trip.tripType": trip.tripType,
    "trip.hotelCategory": trip.hotelCategory,
    "trip.food": trip.food,
    "trip.roomType": trip.roomType,
  };
}

export function leadSaved(input: Pick<CreateLeadInput, "person" | "trip" | "note">): SavedValues {
  return {
    "person.name": input.person.name,
    "person.phone": input.person.phone,
    "person.email": input.person.email,
    "person.instagramHandle": input.person.instagramHandle,
    ...tripSaved(input.trip),
    note: input.note,
  };
}

export function callSaved(input: Pick<LogCallInput, "outcome" | "note" | "followUp">): SavedValues {
  return {
    "call.outcome": input.outcome,
    "call.note": input.note,
    "call.followUp": input.followUp,
  };
}

export function quoteSaved(
  input: Pick<
    UpdateQuoteInput,
    "title" | "startDate" | "adults" | "children" | "days" | "items" | "inclusions" | "exclusions" | "notes"
  >,
): SavedValues {
  return {
    "quote.title": input.title,
    "quote.startDate": input.startDate,
    "quote.adults": input.adults,
    "quote.children": input.children,
    "quote.days": input.days,
    "quote.items": input.items,
    "quote.inclusions": input.inclusions,
    "quote.exclusions": input.exclusions,
    "quote.notes": input.notes,
  };
}
