// A quote's money (step 3, P0): each line's quantity times its price, GST on their sum as one tour operator's supply
// (SAC 998555) at the quote's rate, CGST and SGST within the agency's state or IGST outside it; and how much of what is
// due the payments received cover, in the order it falls due. A taxed quote needs the agency's GST state saved.
import type { QuoteItem } from "@travel-crm/contracts/quotes";
import { isGstStateCode } from "@travel-crm/contracts/kernel";
import { DomainError, indiaGst, money, multiply, sum, type TaxComponent } from "../kernel/index.js";

/** Tour operator services. */
export const TOUR_OPERATOR_SAC = "998555";

export interface QuoteMoney {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** CGST and SGST, or IGST, for the printed quote and invoice. */
  components: readonly TaxComponent[];
}

export function quoteMoney(
  items: readonly QuoteItem[],
  taxRateBasisPoints: number,
  supplierStateCode: string,
  placeOfSupply: string | null,
): QuoteMoney {
  const subtotal = sum(items.map((item) => multiply(money(item.unitPricePaise), item.quantity)));
  if (taxRateBasisPoints === 0 || subtotal.amountPaise === 0) {
    return { subtotalPaise: subtotal.amountPaise, taxPaise: 0, totalPaise: subtotal.amountPaise, components: [] };
  }
  // Without the agency's GST state the tax can't be worked out: a quote with no tax by silence would undercharge.
  if (!isGstStateCode(supplierStateCode)) {
    throw new DomainError(
      "CONFLICT",
      "GST_STATE_REQUIRED",
      "Save your GST state in the business details before you quote with tax",
    );
  }
  const place = placeOfSupply ?? supplierStateCode;
  const breakdown = indiaGst.compute({
    supplierStateCode,
    placeOfSupplyStateCode: place === "OUTSIDE_INDIA" || !isGstStateCode(place) ? "OUTSIDE_INDIA" : place,
    lines: [
      {
        description: "Tour package",
        sacCode: TOUR_OPERATOR_SAC,
        taxableValue: subtotal,
        rateBasisPoints: taxRateBasisPoints,
      },
    ],
  });
  return {
    subtotalPaise: subtotal.amountPaise,
    taxPaise: breakdown.tax.amountPaise,
    totalPaise: breakdown.total.amountPaise,
    components: breakdown.components,
  };
}

/** Which instalments what was paid covers, earliest due first: a part-paid one is not paid. */
export function coveredInstallments<Due extends { amountPaise: number; dueOn: string }>(
  installments: readonly Due[],
  paidPaise: number,
): (Due & { paid: boolean })[] {
  let left = paidPaise;
  return [...installments]
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((due) => {
      const paid = left >= due.amountPaise;
      left = Math.max(0, left - due.amountPaise);
      return { ...due, paid };
    });
}
