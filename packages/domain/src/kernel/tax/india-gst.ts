// India GST (spec 9.6): CGST + SGST (or UTGST) when the place of supply is the supplier's state, IGST between states
// and outside India. The rate is the item's; each line's tax is rounded half-up to the paisa. Deciding the place of
// supply (its rules for tour operators) is the caller's job: the accounts module's, in step 6.
import { isGstStateCode, isUnionTerritoryWithoutLegislature, type GstStateCode } from "@travel-crm/contracts/kernel";
import { add, sum, type Money } from "../money.js";
import { fractionOf } from "../money-rounding.js";
import type { TaxBreakdown, TaxComponent, TaxEngine, TaxedLine } from "./tax-engine.js";

export interface IndiaGstLine {
  description: string;
  /** Services Accounting Code: six digits starting 99, e.g. 998552 for tour operator services. */
  sacCode: string;
  taxableValue: Money;
  /** The item's GST rate in hundredths of a percent: 1800 is 18 %. Rates change (GST 2.0 from 22 September 2025). */
  rateBasisPoints: number;
}

export interface IndiaGstInput {
  supplierStateCode: GstStateCode;
  placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA";
  lines: readonly IndiaGstLine[];
}

export type GstSupplyType = "intra-state" | "inter-state" | "export";

export interface IndiaGstBreakdown extends TaxBreakdown {
  readonly supplyType: GstSupplyType;
}

const SAC_PATTERN = /^99\d{4}$/;

function assertStateCode(code: string, what: string): void {
  if (!isGstStateCode(code)) throw new RangeError(`${what} is not a GST state code: ${JSON.stringify(code)}`);
}

function assertLine(line: IndiaGstLine): void {
  if (!SAC_PATTERN.test(line.sacCode)) {
    throw new RangeError(`A SAC code is six digits starting 99, got ${JSON.stringify(line.sacCode)}`);
  }
  if (!Number.isInteger(line.rateBasisPoints) || line.rateBasisPoints < 0 || line.rateBasisPoints > 10_000) {
    throw new RangeError(`A GST rate is whole basis points from 0 to 10000, got ${String(line.rateBasisPoints)}`);
  }
}

function supplyTypeOf(input: IndiaGstInput): GstSupplyType {
  if (input.placeOfSupplyStateCode === "OUTSIDE_INDIA") return "export";
  return input.placeOfSupplyStateCode === input.supplierStateCode ? "intra-state" : "inter-state";
}

function componentsFor(line: IndiaGstLine, supplyType: GstSupplyType, stateCode: GstStateCode): TaxComponent[] {
  const rate = line.rateBasisPoints;
  if (supplyType !== "intra-state") {
    return [{ name: "IGST", rateBasisPoints: rate, amount: fractionOf(line.taxableValue, rate, 10_000) }];
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
    const lines = input.lines.map((line): TaxedLine => {
      assertLine(line);
      const components = componentsFor(line, supplyType, input.supplierStateCode);
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
