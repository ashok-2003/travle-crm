// A trip as the lead form's fields hold it (P8): read from a lead's page into the fields (tripValuesOf), and from the
// fields into what the api's tripInput checks (tripInputOf). The new-lead form and the trip editor share both. Text is
// kept as typed until it is checked; a select's "none" is a question not asked yet.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type {
  BudgetBasis,
  FoodPreference,
  HotelCategory,
  TravelWhen,
  TripDetail,
  TripType,
} from "@travel-crm/contracts/crm";
import { rupeesFieldText } from "@/components/forms/money-field";
import type { DestinationValue } from "./destination-field";

/** A question not asked yet, as a select or a radio holds it (theirs can't hold an empty value). */
export const NOT_ASKED = "none";

export interface TripValues {
  destination: DestinationValue | null;
  whenKind: TravelWhen["kind"];
  /** yyyy-mm-dd, for exact dates. */
  from: string;
  to: string;
  /** yyyy-mm, for a month. */
  month: string;
  adults: string;
  /** Each child's age as its select holds it, "" until chosen. */
  childrenAges: string[];
  budget: string;
  budgetBasis: BudgetBasis;
  departureCity: string;
  tripType: TripType | typeof NOT_ASKED;
  hotelCategory: HotelCategory | typeof NOT_ASKED;
  food: FoodPreference | typeof NOT_ASKED;
  roomType: string;
}

export const emptyTripValues: TripValues = {
  destination: null,
  whenKind: "unknown",
  from: "",
  to: "",
  month: "",
  adults: "",
  childrenAges: [],
  budget: "",
  budgetBasis: "per_person",
  departureCity: "",
  tripType: NOT_ASKED,
  hotelCategory: NOT_ASKED,
  food: NOT_ASKED,
  roomType: "",
};

/** A lead's trip in the form's fields. */
export function tripValuesOf(trip: TripDetail): TripValues {
  const { when } = trip;
  return {
    destination: trip.destination && {
      kind: "existing",
      destinationId: trip.destination.id,
      name: trip.destination.name,
    },
    whenKind: when.kind,
    from: when.kind === "dates" ? when.from : "",
    to: when.kind === "dates" ? when.to : "",
    month: when.kind === "month" ? when.month : "",
    adults: trip.adults === null ? "" : String(trip.adults),
    childrenAges: trip.childrenAges.map(String),
    budget: trip.budget ? rupeesFieldText(trip.budget.amount.amountPaise) : "",
    budgetBasis: trip.budget?.basis ?? "per_person",
    departureCity: trip.departureCity ?? "",
    tripType: trip.tripType ?? NOT_ASKED,
    hotelCategory: trip.hotelCategory ?? NOT_ASKED,
    food: trip.food ?? NOT_ASKED,
    roomType: trip.roomType ?? "",
  };
}

/** Text as the api takes it: trimmed, or null when nothing was typed. */
export const textOrNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

const asked = <Value extends string>(value: Value | typeof NOT_ASKED): Value | null =>
  value === NOT_ASKED ? null : value;

function whenOf(values: TripValues): TravelWhen {
  switch (values.whenKind) {
    case "dates":
      return { kind: "dates", from: values.from, to: values.to };
    case "month":
      return { kind: "month", month: values.month };
    case "flexible":
    case "unknown":
      return { kind: values.whenKind };
  }
}

/** A count as typed: a whole number, or -1 (which the api refuses) for anything else. */
const countOf = (text: string): number => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : -1);

/** The trip as the api's tripInput takes it, for its schema to check. A budget that isn't an amount is left out. */
export function tripInputOf(values: TripValues) {
  const { destination } = values;
  const budgetPaise = paiseFromRupeesText(values.budget);
  return {
    destination:
      destination === null
        ? null
        : destination.kind === "existing"
          ? { kind: destination.kind, destinationId: destination.destinationId }
          : { kind: destination.kind, name: destination.name },
    when: whenOf(values),
    adults: values.adults.trim() === "" ? null : countOf(values.adults),
    childrenAges: values.childrenAges.map(countOf),
    budget:
      budgetPaise === null
        ? null
        : { amount: { amountPaise: budgetPaise, currency: "INR" as const }, basis: values.budgetBasis },
    departureCity: textOrNull(values.departureCity),
    tripType: asked(values.tripType),
    hotelCategory: asked(values.hotelCategory),
    food: asked(values.food),
    roomType: textOrNull(values.roomType),
  };
}

/** What the trip's fields lack before the api is asked: a typed budget that isn't one, an unchosen age or day. */
export function tripProblems(values: TripValues) {
  const blank = (text: string) => text.trim() === "";
  return {
    ...(!blank(values.budget) && paiseFromRupeesText(values.budget) === null && { budget: "budget" as const }),
    ...(values.childrenAges.some(blank) && { childrenAges: "childAge" as const }),
    ...(values.whenKind === "dates" && blank(values.from) && { from: "from" as const }),
    ...(values.whenKind === "dates" && blank(values.to) && { to: "to" as const }),
    ...(values.whenKind === "month" && blank(values.month) && { month: "month" as const }),
  };
}
