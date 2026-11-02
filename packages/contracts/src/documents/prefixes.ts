// The prefixes the platform numbers its own documents with (spec 9.3): branding samples and documents issued without a
// prefix of their own. An organization's invoice prefix may be none of them, so no invoice shares their number series.

/** Branding samples, numbered apart from real documents: SMPL-2026-0001. */
export const SAMPLE_DOCUMENT_PREFIX = "SMPL";

/** A document whose module gives no prefix of its own: DOC-2026-0001. */
export const DEFAULT_DOCUMENT_PREFIX = "DOC";

/** Quotations, numbered apart from invoices: QT-2026-0001. */
export const QUOTE_DOCUMENT_PREFIX = "QT";

/** Payment receipts: RCT-2026-0001. */
export const RECEIPT_DOCUMENT_PREFIX = "RCT";

/** Bookings, numbered from the organization's counter: BK-2026-0001. */
export const BOOKING_DOCUMENT_PREFIX = "BK";

/** A hotel voucher for a booking's stay: VCH-2026-0001. */
export const VOUCHER_DOCUMENT_PREFIX = "VCH";

/** A booking's itinerary PDF: ITN-2026-0001. */
export const ITINERARY_DOCUMENT_PREFIX = "ITN";

/** A departure's rooming list for one hotel: RML-2026-0001. */
export const ROOMING_DOCUMENT_PREFIX = "RML";

/** An invoice of an agency that has not chosen its own prefix: INV-2026-0001. */
export const DEFAULT_INVOICE_PREFIX = "INV";

/**
 * Prefixes an organization can't choose for its invoices. A module that numbers its documents with a prefix of its own
 * adds it here and to the database's organization_profile_invoice_prefix_not_reserved CHECK, in a migration: a test
 * compares the two.
 */
export const reservedDocumentPrefixes: readonly string[] = [
  SAMPLE_DOCUMENT_PREFIX,
  DEFAULT_DOCUMENT_PREFIX,
  QUOTE_DOCUMENT_PREFIX,
  RECEIPT_DOCUMENT_PREFIX,
  BOOKING_DOCUMENT_PREFIX,
  VOUCHER_DOCUMENT_PREFIX,
  ITINERARY_DOCUMENT_PREFIX,
  ROOMING_DOCUMENT_PREFIX,
];
