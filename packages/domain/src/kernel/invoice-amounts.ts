// What an invoice adds up to: the lines' sum, and GST on the sum as CGST and SGST (the billed company is in the firm's
// state) or IGST, split by the kernel's indiaGst.
import type { GstStateCode } from "@travel-crm/contracts/kernel";
import { money } from "./money.js";
import { indiaGst } from "./tax/india-gst.js";

export interface InvoiceAmounts {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/** The engine needs a services accounting code; invoices print none. */
const SAC_CODE = "998431";

export function invoiceAmounts(
  lines: readonly { amountPaise: number }[],
  rateBasisPoints: number,
  sellerStateCode: GstStateCode,
  billToStateCode: GstStateCode | null,
): InvoiceAmounts {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
  const taxed = indiaGst.compute({
    supplierStateCode: sellerStateCode,
    // With no GST the state is never asked for; the firm's own makes it a plain intra-state sum.
    placeOfSupplyStateCode: billToStateCode ?? sellerStateCode,
    lines: [{ description: "Invoice", sacCode: SAC_CODE, taxableValue: money(subtotalPaise), rateBasisPoints }],
  });
  const part = (name: string) => taxed.components.find((component) => component.name === name)?.amount.amountPaise ?? 0;
  return {
    subtotalPaise,
    cgstPaise: part("CGST"),
    sgstPaise: part("SGST") + part("UTGST"),
    igstPaise: part("IGST"),
    totalPaise: taxed.total.amountPaise,
  };
}
