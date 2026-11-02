// Pricing a quote line from a supplier's rate (release 7b): the season covering the quote's start date gives the cost, which is
// copied into the line (a snapshot); the selling price is the cost plus the agency's default markup, rounded up to a whole
// rupee. A date with no season has no rate: "No rate for these dates", never a guess. Rates are never typed in by the AI.
import type { QuoteItem } from "@travel-crm/contracts/quotes";
import type { PricedLine } from "@travel-crm/contracts/suppliers";
import type { OrgTx } from "@travel-crm/db";
import { rateOnDate, type RateOnDate } from "../suppliers/index.js";
import { DomainError } from "../kernel/index.js";
import { quoteSettingsOf } from "./settings.js";

export const noRateForDates = () => new DomainError("CONFLICT", "NO_RATE_FOR_DATES", "No rate for these dates");

/** The cost plus the markup (basis points), the markup rounded up to a whole rupee: integer paise, never a float. */
export function sellingPrice(costPaise: number, markupBasisPoints: number): number {
  if (markupBasisPoints === 0) return costPaise;
  const markup = Math.ceil((costPaise * markupBasisPoints) / 10_000);
  return costPaise + Math.ceil(markup / 100) * 100;
}

const unitWords: Record<string, string> = {
  per_room_night: "per room night",
  per_person_night: "per person night",
  per_day: "per day",
  per_trip: "per trip",
};
const occupancyWords: Record<string, string> = {
  single: "single",
  double: "double",
  triple: "triple",
  extra_bed: "extra bed",
  child_with_bed: "child with bed",
  child_no_bed: "child without bed",
};

/** What a priced line says about its rate: "MAP, double, per room night (Peak 2026)". */
const detailOf = (rate: RateOnDate) =>
  [rate.mealPlan, occupancyWords[rate.occupancy] ?? "", unitWords[rate.unit] ?? ""]
    .filter((part) => part !== "")
    .join(", ")
    .concat(` (${rate.seasonLabel})`)
    .slice(0, 200);

/** The line for the rate on the day, with the cost copied in. Null when the day has no such rate. */
export async function pricedLineOn(
  tx: OrgTx,
  input: { rateId: string; date: string; quantity: number },
): Promise<PricedLine | null> {
  const rate = await rateOnDate(tx, input.rateId, input.date);
  if (rate === null) return null;
  const { defaultMarkupBasisPoints } = await quoteSettingsOf(tx);
  return {
    description: `${rate.supplierName}: ${rate.item}`.slice(0, 200),
    detail: detailOf(rate),
    quantity: input.quantity,
    unitPricePaise: sellingPrice(rate.costPaise, defaultMarkupBasisPoints),
    costUnitPaise: rate.costPaise,
    rateId: rate.id,
  };
}

/** The same, refused with "No rate for these dates" when there is none. */
export async function priceLine(
  tx: OrgTx,
  input: { rateId: string; date: string; quantity: number },
): Promise<PricedLine> {
  const line = await pricedLineOn(tx, input);
  if (line === null) throw noRateForDates();
  return line;
}

/** A priced line as the quote's items hold it. */
export const itemOf = (line: PricedLine): QuoteItem => ({
  description: line.description,
  detail: line.detail,
  quantity: line.quantity,
  unitPricePaise: line.unitPricePaise,
  costUnitPaise: line.costUnitPaise,
  rateId: line.rateId,
});
