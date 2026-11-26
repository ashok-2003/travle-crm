// Invoice numbers: "<prefix>/<financial year>/<3-digit sequence>", each type counting on its own within the Indian
// financial year (April to March).
import type { InvoiceKind } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";

/** "2026-27" for any day from 1 April 2026 to 31 March 2027; the day is "yyyy-mm-dd". */
export function financialYearOf(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${String(start)}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumber(prefix: string, financialYear: string, sequence: number): string {
  return `${prefix}/${financialYear}/${String(sequence).padStart(3, "0")}`;
}

/**
 * The next sequence for this type and year. The counter row is locked until the transaction ends, so two creates at once
 * get two numbers in turn, and a create that fails gives its number back by rolling the increment back.
 */
export async function takeNextSequence(tx: PlatformTx, kind: InvoiceKind, financialYear: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO platform_invoice_counter (kind, financial_year, value) VALUES (${kind}, ${financialYear}, 1)
    ON CONFLICT (kind, financial_year) DO UPDATE SET value = platform_invoice_counter.value + 1
    RETURNING value`;
  if (row === undefined) throw new Error("The invoice counter returned no row");
  return row.value;
}
