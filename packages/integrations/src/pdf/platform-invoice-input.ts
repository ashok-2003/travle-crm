// What the platform's invoice PDF is given: the firm's invoice to an agency, every amount and date already formatted
// as text by the caller (₹10,000.00, 26 Nov 2026), so the template knows no money, tax or date rules.

export interface PlatformInvoiceData {
  /** "Proforma Invoice", "Tax Invoice" or "Invoice". */
  title: string;
  /** "PI/2026-27/001". */
  number: string;
  issuedOn: string;
  dueOn?: string | undefined;
  /** The firm: its legal name, then its address, PAN, GSTIN, phone and email lines (each only when set). */
  seller: { name: string; lines: readonly string[] };
  /** The company billed: its name, then its address, state and GSTIN lines (each only when set). */
  billTo: { name: string; lines: readonly string[] };
  rows: readonly { description: string; amount: string }[];
  /** Subtotal, each GST part and the total, in order; the total has `emphasis`. */
  totals: readonly { label: string; amount: string; emphasis?: boolean | undefined }[];
  /** "Rupees Ten Thousand Only". */
  totalInWords: string;
  /** How to pay: bank account and UPI lines; null when the firm has given none. */
  payment: { lines: readonly string[] } | null;
  notes?: string | undefined;
  /** "For <firm's legal name>", above "Authorised signatory". */
  signatory: string;
}

/** Renders one platform invoice; `issuedAt` is written into the file, so the same input always gives the same bytes. */
export type RenderPlatformInvoice = (data: PlatformInvoiceData, issuedAt: Date) => Promise<Uint8Array>;
