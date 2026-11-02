// Supplier rates (release 7b): what a supplier charges the agency, by season. A season is a run of dates; a date with no season
// has no rate. A rate is one item (a room type, or a vehicle and route) with its meal plan, occupancy and unit, in paise.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

const text = (max: number) => z.string().trim().max(max);

export const rateMealPlans = ["", "EP", "CP", "MAP", "AP"] as const;
export const rateMealPlan = z.enum(rateMealPlans);
export const rateOccupancies = [
  "",
  "single",
  "double",
  "triple",
  "extra_bed",
  "child_with_bed",
  "child_no_bed",
] as const;
export const rateOccupancy = z.enum(rateOccupancies);
export const rateUnits = ["per_room_night", "per_person_night", "per_day", "per_trip"] as const;
export const rateUnit = z.enum(rateUnits);
export type RateUnit = z.infer<typeof rateUnit>;

/** ₹10 crore in paise, as a quote's amounts are. */
export const MAX_RATE_PAISE = 10_000_000_000;

export const seasonFields = {
  label: text(80).min(1),
  startsOn: calendarDate,
  endsOn: calendarDate,
};
const endsAfterStart = (value: { startsOn: string; endsOn: string }) => value.endsOn >= value.startsOn;
const endsAfterStartMessage = { message: "The season must end on or after its first day", path: ["endsOn"] };

export const saveSeasonInput = z
  .strictObject({
    supplierId: recordId,
    /** Set to change a season; left out to add one. */
    seasonId: recordId.optional(),
    ...seasonFields,
  })
  .refine(endsAfterStart, endsAfterStartMessage);
export type SaveSeasonInput = z.infer<typeof saveSeasonInput>;

/** Copies a season with its rates to other dates (next year), every cost changed by a share, in basis points (500 = +5 %). */
export const copySeasonInput = z
  .strictObject({
    seasonId: recordId,
    ...seasonFields,
    changeBasisPoints: z.int().min(-9000).max(100_000),
  })
  .refine(endsAfterStart, endsAfterStartMessage);
export type CopySeasonInput = z.infer<typeof copySeasonInput>;
export const seasonIdInput = z.strictObject({ seasonId: recordId });

export const rateFields = {
  item: text(160).min(1),
  mealPlan: rateMealPlan,
  occupancy: rateOccupancy,
  unit: rateUnit,
  costPaise: z.int().min(0).max(MAX_RATE_PAISE),
  note: text(300),
};
export const saveRateInput = z.strictObject({
  seasonId: recordId,
  /** Set to change a rate; left out to add one. */
  rateId: recordId.optional(),
  ...rateFields,
});
export type SaveRateInput = z.infer<typeof saveRateInput>;
export const rateIdInput = z.strictObject({ rateId: recordId });

export const supplierRate = z.object({ id: recordId, ...rateFields });
export type SupplierRate = z.infer<typeof supplierRate>;
export const rateSeason = z.object({
  id: recordId,
  label: z.string(),
  startsOn: calendarDate,
  endsOn: calendarDate,
  rates: z.array(supplierRate),
});
export type RateSeason = z.infer<typeof rateSeason>;
export const supplierRateCatalog = z.object({ seasons: z.array(rateSeason) });
export type SupplierRateCatalog = z.infer<typeof supplierRateCatalog>;

/** The rates a supplier has on a date: the season that covers it, or null ("No rate for these dates"). */
export const ratesOnDateInput = z.strictObject({ supplierId: recordId, date: calendarDate });
export const ratesOnDate = z.object({
  season: z.object({ id: recordId, label: z.string() }).nullable(),
  rates: z.array(supplierRate),
});
export type RatesOnDate = z.infer<typeof ratesOnDate>;

/** A quote line priced from a rate for a date and a quantity: the cost is copied, the price is cost plus the agency's markup. */
export const priceLineInput = z.strictObject({
  rateId: recordId,
  date: calendarDate,
  quantity: z.int().min(1).max(1000),
});
export type PriceLineInput = z.infer<typeof priceLineInput>;
export const pricedLine = z.object({
  description: z.string(),
  detail: z.string(),
  quantity: z.int(),
  unitPricePaise: z.int(),
  costUnitPaise: z.int(),
  rateId: recordId,
});
export type PricedLine = z.infer<typeof pricedLine>;
