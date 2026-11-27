// An invoice's lines as stored (JSON): quantity, rate and amount. Invoices made before quantities hold only a
// description and an amount; they read as quantity 1 at that amount, and are never rewritten.
import { storedInvoiceLine, type CreateInvoiceInput, type InvoiceDetail } from "@travel-crm/contracts/platform";

type StoredLine = InvoiceDetail["lines"][number];

/** The lines to store for a new invoice: each with its amount, quantity × rate. */
export function linesWithAmounts(lines: CreateInvoiceInput["lines"]): StoredLine[] {
  return lines.map((line) => ({ ...line, amountPaise: line.quantity * line.ratePaise }));
}

/** Stored lines for display: an old line without a quantity is 1 at its amount. */
export function readStoredLines(stored: unknown): StoredLine[] {
  if (!Array.isArray(stored)) throw new RangeError("An invoice's stored lines are not a list");
  return stored
    .map((line: unknown) => storedInvoiceLine.parse(line))
    .map(({ description, amountPaise, quantity, ratePaise }) => ({
      description,
      quantity: quantity ?? 1,
      ratePaise: quantity === undefined || ratePaise === undefined ? amountPaise : ratePaise,
      amountPaise,
    }));
}
