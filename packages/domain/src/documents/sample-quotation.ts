// The Foundation's one sample document as a quotation (spec 9.3): lines with their GST worked out by the tax engine
// and every amount in Indian format, ready for issueDocument. Real quotations arrive with the quotes module (step 3).
import type { IssueDocumentInput } from "@travel-crm/contracts/documents";
import { formatMoney, indiaGst, type GstStateCode, type IndiaGstLine, type TaxComponent } from "../kernel/index.js";

export interface SampleQuotationLine extends IndiaGstLine {
  /** A second line under the description, e.g. "2 adults, 3 nights". */
  detail?: string | undefined;
}

export interface SampleQuotation {
  recipient: { name: string; lines: string[] };
  /** The agency's GST state and the place of supply, which decide CGST + SGST or IGST. */
  supplierStateCode: GstStateCode;
  placeOfSupplyStateCode: GstStateCode | "OUTSIDE_INDIA";
  lines: readonly SampleQuotationLine[];
  branding: IssueDocumentInput["branding"];
  notes?: string | undefined;
}

/** "CGST 2.5 %": half rates such as 2.5 keep their decimal. */
function taxLabel(component: TaxComponent): string {
  return `${component.name} ${String(component.rateBasisPoints / 100)} %`;
}

export function sampleQuotation(quotation: SampleQuotation): IssueDocumentInput {
  const breakdown = indiaGst.compute({
    supplierStateCode: quotation.supplierStateCode,
    placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
    lines: quotation.lines,
  });
  return {
    template: "sample",
    content: {
      title: "Quotation",
      recipient: quotation.recipient,
      rows: quotation.lines.map((line) => ({
        description: line.description,
        // A blank detail is left out rather than printed as an empty part.
        detail: [line.detail?.trim(), `SAC ${line.sacCode}`]
          .filter((part) => part !== undefined && part !== "")
          .join(" · "),
        amount: formatMoney(line.taxableValue),
      })),
      totals: [
        { label: "Taxable value", amount: formatMoney(breakdown.taxableValue) },
        ...breakdown.components.map((component) => ({
          label: taxLabel(component),
          amount: formatMoney(component.amount),
        })),
        { label: "Total", amount: formatMoney(breakdown.total), emphasis: true },
      ],
      ...(quotation.notes === undefined ? {} : { notes: quotation.notes }),
    },
    branding: quotation.branding,
  };
}
