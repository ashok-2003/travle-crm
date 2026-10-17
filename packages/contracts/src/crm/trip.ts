// A trip as the lead form, the trip editor and the pages carry it (spec 3.2): where, when, who, the budget and the
// preferences. Inputs give every key, null when not known yet; when and the children's ages are never null.
import { z } from "zod";
import { destination, destinationName } from "../catalog/destinations.js";
import { recordId } from "../identity/fields.js";
import { currencyCodes, moneyField } from "../kernel/money.js";
import { calendarDate } from "../kernel/time.js";
import { budgetBasis, foodPreference, hotelCategory, shortText, tripType } from "./fields.js";

/** A month, as "2026-12". */
export const calendarMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-12");

/** When they travel: exact dates, a month, "flexible", or not asked yet. */
export const travelWhen = z.discriminatedUnion("kind", [
  z
    .strictObject({ kind: z.literal("dates"), from: calendarDate, to: calendarDate })
    .refine((dates) => dates.to >= dates.from, { message: "End on or after the first day", path: ["to"] }),
  z.strictObject({ kind: z.literal("month"), month: calendarMonth }),
  z.strictObject({ kind: z.literal("flexible") }),
  z.strictObject({ kind: z.literal("unknown") }),
]);
export type TravelWhen = z.infer<typeof travelWhen>;

/** One of the agency's destinations, or a new name to add to its list. */
export const destinationChoice = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("existing"), destinationId: recordId }),
  z.strictObject({ kind: z.literal("new"), name: destinationName }),
]);
export type DestinationChoice = z.infer<typeof destinationChoice>;

/** The largest budget the lead table holds: ₹100 crore, in paise. */
export const MAX_BUDGET_PAISE = 100_000_000_000;

export const budgetInput = z.strictObject({
  amount: moneyField.refine((money) => money.amountPaise >= 1 && money.amountPaise <= MAX_BUDGET_PAISE, {
    message: "Use an amount from ₹0.01 to ₹100 crore",
    path: ["amountPaise"],
  }),
  basis: budgetBasis,
});
export type BudgetInput = z.infer<typeof budgetInput>;

/** A budget as the pages show it. */
export const budget = z.object({
  amount: z.object({ amountPaise: z.int(), currency: z.enum(currencyCodes) }),
  basis: budgetBasis,
});
export type Budget = z.infer<typeof budget>;

export const tripInput = z.strictObject({
  destination: destinationChoice.nullable(),
  when: travelWhen,
  adults: z.int().min(1).max(99).nullable(),
  /** Each child's age, 0-17; the count is how many there are. */
  childrenAges: z.array(z.int().min(0).max(17)).max(20),
  budget: budgetInput.nullable(),
  departureCity: shortText.nullable(),
  tripType: tripType.nullable(),
  hotelCategory: hotelCategory.nullable(),
  food: foodPreference.nullable(),
  roomType: shortText.nullable(),
});
export type TripInput = z.infer<typeof tripInput>;

/** A trip in one line's worth: "Kashmir · Dec · 2 adults, 1 child". */
export const tripSummary = z.object({
  destinationName: z.string().nullable(),
  when: travelWhen,
  adults: z.int().nullable(),
  childrenCount: z.int(),
});
export type TripSummary = z.infer<typeof tripSummary>;

/** A trip whole, as the lead page and a repeat enquiry show it. */
export const tripDetail = z.object({
  destination: destination.nullable(),
  when: travelWhen,
  adults: z.int().nullable(),
  childrenAges: z.array(z.int()),
  budget: budget.nullable(),
  departureCity: z.string().nullable(),
  tripType: tripType.nullable(),
  hotelCategory: hotelCategory.nullable(),
  food: foodPreference.nullable(),
  roomType: z.string().nullable(),
});
export type TripDetail = z.infer<typeof tripDetail>;
