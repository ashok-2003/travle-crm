// Inputs and outputs for share links (spec 9.3), and the payload of the share-link.opened event.
import { z } from "zod";

/** What a link opens, as a record type such as "issued_document". The database checks the same pattern. */
export const shareableRecordType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use a record type like issued_document");

/**
 * No control characters, line or paragraph separators, or bidi marks and overrides (they can disguise what was
 * shared), and something visible. Joiners (U+200C, U+200D) stay allowed: Indic scripts need them.
 */
export const isVisibleShareLinkText = (text: string) =>
  !/[\p{Cc}\u200E\u200F\u061C\u2028\u2029\u202A-\u202E\u2066-\u2069]/u.test(text) && /[\p{L}\p{N}]/u.test(text);

/** What was shared, as staff see it, e.g. "Quotation QT-2026-0042". */
export const shareLinkLabel = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(isVisibleShareLinkText, "Use a visible label without control characters");

/** The 65-character token in /p/<token>. */
export const shareLinkToken = z.string().regex(/^[A-Za-z0-9_-]{65}$/);

const instant = z.iso.datetime({ offset: true });

export const createShareLinkInput = z.strictObject({
  recordType: shareableRecordType,
  recordId: z.uuid(),
  label: shareLinkLabel,
  /** Leave out for the default (30 days); null for a link that never expires. */
  expiresAt: instant.nullable().optional(),
});

export const createdShareLink = z.strictObject({
  shareLinkId: z.uuid(),
  /** Shown once: only a hash of its secret part is stored. */
  token: shareLinkToken,
  path: z.string().startsWith("/p/"),
});

export const revokeShareLinkInput = z.strictObject({ shareLinkId: z.uuid() });

/** One record's links, for staff. */
export const listShareLinksInput = z.strictObject({ recordType: shareableRecordType, recordId: z.uuid() });

export const shareLinkSummary = z.strictObject({
  id: z.uuid(),
  recordType: shareableRecordType,
  recordId: z.uuid(),
  label: z.string(),
  createdBy: z.uuid().nullable(),
  createdAt: instant,
  expiresAt: instant.nullable(),
  revokedAt: instant.nullable(),
  openCount: z.number().int().min(0),
  lastOpenedAt: instant.nullable(),
});

/** The payload of "share-link.opened", published when a customer opens a link. */
export const shareLinkOpenedEvent = z.strictObject({ shareLinkId: z.uuid(), openId: z.uuid() });

export type CreateShareLinkInput = z.infer<typeof createShareLinkInput>;
export type CreatedShareLink = z.infer<typeof createdShareLink>;
export type RevokeShareLinkInput = z.infer<typeof revokeShareLinkInput>;
export type ListShareLinksInput = z.infer<typeof listShareLinksInput>;
export type ShareLinkSummary = z.infer<typeof shareLinkSummary>;
export type ShareLinkOpenedEvent = z.infer<typeof shareLinkOpenedEvent>;
