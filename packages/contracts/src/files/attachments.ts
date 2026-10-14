// Inputs and outputs for files attached to records (spec 9.2): presigned uploads and downloads, and what a file is.
import { z } from "zod";

/** What staff may upload: documents and photos of them. Not SVG or HTML, which can carry scripts. */
export const attachmentContentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export type AttachmentContentType = (typeof attachmentContentTypes)[number];

/** The largest file one upload may be: 25 MB. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** The kind of record a file belongs to, e.g. "issued_document" or "lead". The attachment table checks the same. */
export const recordType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use lower-case letters and underscores");

/**
 * The name a file downloads as. No folders, and no control, direction or line-separator characters (U+200E, U+200F,
 * U+061C, U+2028, U+2029, U+202A-202E, U+2066-2069): "invoice<RLO>fdp.exe" shows as "invoiceexe.pdf". Zero-width
 * joiners stay: Indian scripts need them.
 */
export const attachmentFileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (name) => !/[/\\\p{Cc}\u200E\u200F\u061C\u2028\u2029\u202A-\u202E\u2066-\u2069]/u.test(name),
    "Use a file name without folders or control characters",
  );

export const requestUploadInput = z.strictObject({
  recordType,
  recordId: z.uuid(),
  fileName: attachmentFileName,
  contentType: z.enum(attachmentContentTypes),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  /** Traveller ID documents (passport, Aadhaar): viewing them needs documents:view_sensitive. */
  sensitive: z.boolean().default(false),
});
export type RequestUploadInput = z.infer<typeof requestUploadInput>;

export const attachmentIdInput = z.strictObject({ attachmentId: z.uuid() });
export type AttachmentIdInput = z.infer<typeof attachmentIdInput>;

/** A file named together with the record it belongs to, so a router that authorised one record can't be handed another's. */
export const attachmentRefInput = z.strictObject({ recordType, recordId: z.uuid(), attachmentId: z.uuid() });
export type AttachmentRefInput = z.infer<typeof attachmentRefInput>;

export const attachmentSummary = z.object({
  id: z.uuid(),
  recordType: z.string(),
  recordId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  sensitive: z.boolean(),
  /** "pending" until the upload is confirmed in storage. */
  status: z.enum(["pending", "ready"]),
  createdAt: z.iso.datetime(),
});
export type AttachmentSummary = z.infer<typeof attachmentSummary>;

/** Where the browser PUTs the file, with the headers it must send unchanged. */
export const presignedUpload = z.object({
  url: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type PresignedUploadOutput = z.infer<typeof presignedUpload>;

/** A short-lived link that downloads the file. */
export const downloadLink = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type DownloadLinkOutput = z.infer<typeof downloadLink>;
