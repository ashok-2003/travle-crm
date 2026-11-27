// The invoice form's values, as text, turned into the api's input, and the totals the form previews as the person
// types. The api's own schema decides what is valid; each problem is named so the form shows it on its field.
import { paiseFromRupeesText, type GstStateCode } from "@travel-crm/contracts/kernel";
import {
  createInvoiceInput,
  MAX_INVOICE_LINE_PAISE,
  MAX_INVOICE_QUANTITY,
  type CreateInvoiceInput,
  type InvoiceDetail,
  type InvoiceKind,
} from "@travel-crm/contracts/platform";
import { invoiceAmounts, type InvoiceAmounts } from "@travel-crm/domain/kernel";
import type { Checked, Problems } from "@/components/forms/checked";
import { rupeesFieldText } from "@/components/forms/money-field";

export interface InvoiceLineValues {
  description: string;
  /** A whole number as typed. */
  quantity: string;
  /** Rupees as typed, for one. */
  rate: string;
}

export interface InvoiceValues {
  kind: InvoiceKind;
  issuedOn: string;
  dueOn: string;
  billToName: string;
  billToAddress: string;
  billToStateCode: string;
  billToGstin: string;
  lines: InvoiceLineValues[];
  /** Basis points as text: "0", "500", "1800". */
  gstRate: string;
  notes: string;
}

/** Message keys in the "consoleInvoices.invoiceForm.problems" namespace. */
export type InvoiceProblem = "required" | "invalid" | "quantityInvalid" | "rateInvalid" | "stateNeededForGst";

/** The most lines an invoice takes (the api's limit). */
export const MAX_LINES = 20;

export const emptyLine: InvoiceLineValues = { description: "", quantity: "1", rate: "" };

/** A new invoice: an invoice of today, one empty line, no GST, the default terms in its notes. */
export function newInvoiceValues(today: string, defaultTerms: string | null): InvoiceValues {
  return {
    kind: "invoice",
    issuedOn: today,
    dueOn: "",
    billToName: "",
    billToAddress: "",
    billToStateCode: "",
    billToGstin: "",
    lines: [{ ...emptyLine }],
    gstRate: "0",
    notes: defaultTerms ?? "",
  };
}

/**
 * A copy of an invoice: everything but the dates (today's and none), always an Invoice (copying a pre-invoice is how
 * it becomes one), and no GST once the firm can no longer charge it.
 */
export function copiedInvoiceValues(invoice: InvoiceDetail, today: string, canChargeGst: boolean): InvoiceValues {
  return {
    kind: "invoice",
    issuedOn: today,
    dueOn: "",
    billToName: invoice.billToName,
    billToAddress: invoice.billToAddress ?? "",
    billToStateCode: invoice.billToStateCode ?? "",
    billToGstin: invoice.billToGstin ?? "",
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      rate: rupeesFieldText(line.ratePaise),
    })),
    gstRate: canChargeGst ? String(invoice.gstRateBasisPoints) : "0",
    notes: invoice.notes ?? "",
  };
}

const blankToUndefined = (text: string): string | undefined => (text.trim() === "" ? undefined : text.trim());

/** Each place the api's schema can refuse, with the form field it comes from and that field's problem. */
function placeOf(path: readonly PropertyKey[]): [string, InvoiceProblem] | undefined {
  const [first, second, third] = path;
  if (first === "lines" && typeof second === "number") {
    if (third === "description") return [`lines.${String(second)}.description`, "invalid"];
    if (third === "quantity") return [`lines.${String(second)}.quantity`, "quantityInvalid"];
    // The rate, and a line whose quantity × rate passes the most a line may charge (the schema names the rate).
    if (third === "ratePaise") return [`lines.${String(second)}.rate`, "rateInvalid"];
    return undefined;
  }
  if (first === "billTo") {
    const field = { name: "billToName", address: "billToAddress", stateCode: "billToStateCode", gstin: "billToGstin" }[
      String(second)
    ];
    return field === undefined ? undefined : [field, "invalid"];
  }
  const field = { kind: "kind", issuedOn: "issuedOn", dueOn: "dueOn", gstRateBasisPoints: "gstRate", notes: "notes" }[
    String(first)
  ];
  return field === undefined ? undefined : [field, "invalid"];
}

export function toCreateInvoiceInput(
  values: InvoiceValues,
): Checked<InvoiceValues, CreateInvoiceInput, InvoiceProblem> {
  const gstRateBasisPoints = Number(values.gstRate);
  const parsed = createInvoiceInput.safeParse({
    kind: values.kind,
    issuedOn: values.issuedOn,
    dueOn: blankToUndefined(values.dueOn),
    billTo: {
      name: values.billToName,
      address: blankToUndefined(values.billToAddress),
      stateCode: blankToUndefined(values.billToStateCode),
      gstin: blankToUndefined(values.billToGstin),
    },
    lines: values.lines.map((line) => ({
      description: line.description,
      quantity: wholeNumber(line.quantity) ?? Number.NaN,
      ratePaise: paiseFromRupeesText(line.rate) ?? Number.NaN,
    })),
    gstRateBasisPoints,
    notes: blankToUndefined(values.notes),
  });
  // A GST rate needs the state: the schema checks only that the api's own rule holds, so it is said here as well.
  const needsState = gstRateBasisPoints > 0 && values.billToStateCode === "";
  if (parsed.success && !needsState) return { ok: true, input: parsed.data };

  const problems: Record<string, InvoiceProblem> = needsState ? { billToStateCode: "stateNeededForGst" } : {};
  // Each form field's text by its name, to tell a blank field ("required") from a wrong one.
  const texts: Record<string, string> = {
    kind: values.kind,
    issuedOn: values.issuedOn,
    dueOn: values.dueOn,
    billToName: values.billToName,
    billToAddress: values.billToAddress,
    billToStateCode: values.billToStateCode,
    billToGstin: values.billToGstin,
    gstRate: values.gstRate,
    notes: values.notes,
    ...Object.fromEntries(
      values.lines.flatMap((line, index) => [
        [`lines.${String(index)}.description`, line.description],
        [`lines.${String(index)}.quantity`, line.quantity],
        [`lines.${String(index)}.rate`, line.rate],
      ]),
    ),
  };
  let unplaced = false;
  for (const issue of parsed.error?.issues ?? []) {
    const place = placeOf(issue.path);
    if (place === undefined) {
      unplaced = true;
      continue;
    }
    const [field, problem] = place;
    if (problems[field] !== undefined) continue;
    const isBlank = texts[field]?.trim() === "";
    problems[field] = isBlank ? "required" : problem;
  }
  // Flat dotted keys are how react-hook-form's resolver names a line's field; Problems only knows the top-level ones.
  const named = problems as Problems<InvoiceValues, InvoiceProblem>;
  return unplaced ? { ok: false, problems: named, unplaced } : { ok: false, problems: named };
}

/** A whole number as typed ("12"), or null for anything else. */
function wholeNumber(text: string): number | null {
  return /^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * A line's amount in paise as typed: quantity × rate. Nothing while either isn't valid yet, or when the amount would
 * pass the most a line may charge: such a line counts as nothing in the totals until it is fixed.
 */
export function lineAmountPaise(line: Pick<InvoiceLineValues, "quantity" | "rate">): number {
  const quantity = wholeNumber(line.quantity);
  const rate = paiseFromRupeesText(line.rate);
  if (quantity === null || rate === null || quantity < 1 || quantity > MAX_INVOICE_QUANTITY) return 0;
  const amount = quantity * rate;
  return amount > MAX_INVOICE_LINE_PAISE ? 0 : amount;
}

/**
 * What the invoice adds up to, as the api computes it: the kernel's own invoiceAmounts, the same function, on each
 * line's quantity × rate.
 */
export function previewAmounts(
  lines: readonly Pick<InvoiceLineValues, "quantity" | "rate">[],
  rateBasisPoints: number,
  sellerStateCode: GstStateCode,
  billToStateCode: GstStateCode | null,
): InvoiceAmounts {
  return invoiceAmounts(
    lines.map((line) => ({ amountPaise: lineAmountPaise(line) })),
    rateBasisPoints,
    sellerStateCode,
    billToStateCode,
  );
}
