// What the platform's invoice PDF is given: the firm's invoice to an agency, every amount and date already formatted
// as text by the caller (₹10,000.00, 26 Nov 2026), so the template knows no money, tax or date rules.

/** A PNG or JPEG the invoice draws: the logo beside the firm's name, or the signature above the signatory's name. */
export interface PlatformInvoiceImage {
  data: Uint8Array;
  contentType: "image/png" | "image/jpeg";
}

export interface PlatformInvoiceData {
  /** "Proforma Invoice", "Tax Invoice" or "Invoice". */
  title: string;
  /** "PI/2026-27/001". */
  number: string;
  issuedOn: string;
  dueOn?: string | undefined;
  /**
   * The firm: its legal name, then its address, PAN, GSTIN, phone and email lines (each only when set), and its state
   * as "Uttar Pradesh (State code: 09)", printed right after the first line (the address).
   */
  seller: { name: string; lines: readonly string[]; stateLine: string };
  /** The company billed: its name, then its address and GSTIN lines (each only when set), and its state when given. */
  billTo: { name: string; lines: readonly string[]; stateLine?: string | undefined };
  /** One line each: its place, what it is, how many, the rate and the amount (quantity × rate). */
  rows: readonly { index: number; description: string; quantity: number; rate: string; amount: string }[];
  /** Subtotal, each GST part and the total, in order; the total has `emphasis`. */
  totals: readonly { label: string; amount: string; emphasis?: boolean | undefined }[];
  /** "Rupees Ten Thousand Only". */
  totalInWords: string;
  /** How to pay, a labelled row for each detail the firm has given ("Account number"); null when it has given none. */
  /** `mono` for the figures (account number, IFSC, UPI ID); names (account name, bank) read in the body font. */
  payment: { rows: readonly { label: string; value: string; mono?: boolean | undefined }[] } | null;
  notes?: string | undefined;
  /** The firm's logo, drawn in a box 48 pt high beside its name, when set. */
  logo?: PlatformInvoiceImage | undefined;
  /** The signature image, drawn in a box 140 × 60 pt above the signatory's name, when set. */
  signature?: PlatformInvoiceImage | undefined;
  /** "For <firm>", then the signature, a line, and the signatory's name and title when the firm has given them. */
  signatory: { firm: string; name?: string | undefined; title?: string | undefined };
  /** The footer's left side: the firm's name and address in one line. */
  footer: string;
}

/** Renders one platform invoice; `issuedAt` is written into the file, so the same input always gives the same bytes. */
export type RenderPlatformInvoice = (data: PlatformInvoiceData, issuedAt: Date) => Promise<Uint8Array>;
