// India GST (spec 9.6): CGST + SGST (or UTGST) when the place of supply is the supplier's state, IGST between states
// and outside India. The rate is the item's; each line's tax is rounded half-up to the paisa. Deciding the place of
// supply (its rules for tour operators) is the caller's job: the accounts module's, in step 6.
import { isGstStateCode, isUnionTerritoryWithoutLegislature, type GstStateCode } from "@travel-crm/contracts/kernel";
import { add, money, sum, type Money } from "../money.js";
import { fractionOf } from "../money-rounding.js";
import type { TaxBreakdown, TaxComponent, TaxEngine, TaxedLine } from "./tax-engine.js";

export interface IndiaGstLine {
  description: string;
  /**
   * Services Accounting Code: six digits starting 99 (six digits are required, Notification 78/2020-CT). Tour
   * operator services are 998555; 998552 is reservation services for accommodation, cruises and package tours.
   */
  sacCode: string;
  taxableValue: Money;
  /** The item's GST rate in hundredths of a percent: 1800 is 18 %. Rates change (GST 2.0 from 22 September 2025). */
  rateBasisPoints: number;
}

export interface IndiaGstInput {
  supplierStateCode: GstStateCode;
  placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA";
  lines: readonly IndiaGstLine[];
  /** A supply to or by an SEZ unit or developer is inter-state (IGST) even within one state (IGST Act s.7(5)(b)). */
  specialEconomicZone?: boolean;
  /**
   * A zero-rated supply under a Letter of Undertaking or bond: IGST is reported at the item's rate with no tax, as
   * GSTR-1 and e-invoices do. Only for an SEZ supply or a supply outside India.
   */
  withoutPayment?: boolean;
}

/**
 * Where the supply is taxed. "outside-india" is any place of supply outside India; whether it is an export of
 * services under s.2(6) of the IGST Act depends on conditions the caller decides.
 */
export type GstSupplyType = "intra-state" | "inter-state" | "outside-india";

export interface IndiaGstBreakdown extends TaxBreakdown {
  readonly supplyType: GstSupplyType;
}

const SAC_PATTERN = /^99\d{4}$/;

function assertStateCode(code: string, what: string): void {
  if (!isGstStateCode(code)) throw new RangeError(`${what} is not a GST state code: ${JSON.stringify(code)}`);
}

function assertLine(line: IndiaGstLine): void {
  if (!SAC_PATTERN.test(line.sacCode)) {
    throw new RangeError(
      `A SAC code is six digits starting 99 (tour operators use 998555, or another 99855x), got ${JSON.stringify(line.sacCode)}`,
    );
  }
  if (!Number.isInteger(line.rateBasisPoints) || line.rateBasisPoints < 0 || line.rateBasisPoints > 10_000) {
    throw new RangeError(`A GST rate is whole basis points from 0 to 10000, got ${String(line.rateBasisPoints)}`);
  }
}

function supplyTypeOf(input: IndiaGstInput): GstSupplyType {
  if (input.placeOfSupplyStateCode === "OUTSIDE_INDIA") return "outside-india";
  if (input.specialEconomicZone === true) return "inter-state";
  return input.placeOfSupplyStateCode === input.supplierStateCode ? "intra-state" : "inter-state";
}

function componentsFor(
  line: IndiaGstLine,
  supplyType: GstSupplyType,
  stateCode: GstStateCode,
  withoutPayment: boolean,
): TaxComponent[] {
  const rate = line.rateBasisPoints;
  if (supplyType !== "intra-state") {
    const amount = withoutPayment ? money(0, line.taxableValue.currency) : fractionOf(line.taxableValue, rate, 10_000);
    return [{ name: "IGST", rateBasisPoints: rate, amount }];
  }
  // Each half is computed and rounded on its own, so CGST and its partner are always equal.
  const half = fractionOf(line.taxableValue, rate, 20_000);
  const partner = isUnionTerritoryWithoutLegislature(stateCode) ? "UTGST" : "SGST";
  return [
    { name: "CGST", rateBasisPoints: rate / 2, amount: half },
    { name: partner, rateBasisPoints: rate / 2, amount: half },
  ];
}

/** Totals per tax name and rate, in the order they first appear. */
function totalsOf(lines: readonly TaxedLine[]): TaxComponent[] {
  const totals = new Map<string, TaxComponent>();
  for (const component of lines.flatMap((line) => line.components)) {
    const key = `${component.name}@${String(component.rateBasisPoints)}`;
    const total = totals.get(key);
    totals.set(key, total ? { ...total, amount: add(total.amount, component.amount) } : component);
  }
  return [...totals.values()];
}

export const indiaGst: TaxEngine<IndiaGstInput, IndiaGstBreakdown> = {
  compute(input) {
    assertStateCode(input.supplierStateCode, "The supplier's state");
    if (input.placeOfSupplyStateCode !== "OUTSIDE_INDIA") {
      assertStateCode(input.placeOfSupplyStateCode, "The place of supply");
    }
    const supplyType = supplyTypeOf(input);
    const withoutPayment = input.withoutPayment === true;
    if (withoutPayment && supplyType !== "outside-india" && input.specialEconomicZone !== true) {
      throw new RangeError(
        "A supply without payment of tax is only for a special economic zone or a place outside India",
      );
    }
    const lines = input.lines.map((line): TaxedLine => {
      assertLine(line);
      const components = componentsFor(line, supplyType, input.supplierStateCode, withoutPayment);
      const tax = sum(
        components.map((component) => component.amount),
        line.taxableValue.currency,
      );
      return {
        description: line.description,
        code: line.sacCode,
        taxableValue: line.taxableValue,
        components,
        tax,
        total: add(line.taxableValue, tax),
      };
    });
    const currency = input.lines[0]?.taxableValue.currency ?? "INR";
    const taxableValue = sum(
      lines.map((line) => line.taxableValue),
      currency,
    );
    const tax = sum(
      lines.map((line) => line.tax),
      currency,
    );
    return { supplyType, lines, components: totalsOf(lines), taxableValue, tax, total: add(taxableValue, tax) };
  },
};
