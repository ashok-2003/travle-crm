// The prefixes the platform numbers its own documents with (spec 9.3): branding samples and documents issued without a
// prefix of their own. An organization's invoice prefix may be none of them, so no invoice shares their number series.

/** Branding samples, numbered apart from real documents: SMPL-2026-0001. */
export const SAMPLE_DOCUMENT_PREFIX = "SMPL";

/** A document whose module gives no prefix of its own: DOC-2026-0001. */
export const DEFAULT_DOCUMENT_PREFIX = "DOC";

/**
 * Prefixes an organization can't choose for its invoices. A module that numbers its documents with a prefix of its own
 * adds it here and to the database's organization_profile_invoice_prefix_not_reserved CHECK, in a migration: a test
 * compares the two.
 */
export const reservedDocumentPrefixes: readonly string[] = [SAMPLE_DOCUMENT_PREFIX, DEFAULT_DOCUMENT_PREFIX];
