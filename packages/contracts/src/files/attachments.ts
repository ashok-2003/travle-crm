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

/** The record type of a WhatsApp message: its files are what customers send and staff reply with (ADR 0035). */
export const WHATSAPP_RECORD_TYPE = "whatsapp_message";
/** The record type of a trip's details (sales inbox, trip details): the photos, videos and PDFs sent with them on WhatsApp. */
export const TRIP_KIT_RECORD_TYPE = "trip_kit";
/** The record type of a document the agency gives its AI (packages, prices, policies): a PDF or plain text. */
export const AI_KNOWLEDGE_RECORD_TYPE = "ai_knowledge";
export const aiKnowledgeFileTypes = ["application/pdf", "text/plain"] as const;
/** The record type of a photo, video or PDF the agency's AI sends in chats (its media). */
export const AI_MEDIA_RECORD_TYPE = "ai_media";
export const aiMediaFileTypes = ["image/jpeg", "image/png", "video/mp4", "application/pdf"] as const;

/** What a WhatsApp message may carry: the attachment types plus the video, voice notes and Office files people send. */
export const whatsappContentTypes = [
  ...attachmentContentTypes,
  "video/mp4",
  "video/3gpp",
  "audio/ogg",
  "audio/mpeg",
  "audio/aac",
  "audio/mp4",
  "audio/amr",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

/** The largest file one upload may be: 25 MB. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * An import's file (spec B2): CSV or .xlsx, for the import_batch record alone. The files module refuses them under any
 * other record (CONTENT_TYPE_NOT_ALLOWED), and the attachment types under an import's.
 */
export const spreadsheetContentTypes = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export type SpreadsheetContentType = (typeof spreadsheetContentTypes)[number];

/** Each spreadsheet kind's type, by name rather than by its place in the list (W8). */
export const spreadsheetContentTypeOf = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const satisfies Record<"csv" | "xlsx", SpreadsheetContentType>;

/** The largest file an import takes: 10 MB. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

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
  /** The files module decides which types a record takes (an import's file is a spreadsheet, nothing else is). */
  contentType: z.enum([...whatsappContentTypes, ...spreadsheetContentTypes]),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  /** Traveller ID documents (passport, Aadhaar): viewing them needs documents:view_sensitive. */
  sensitive: z.boolean().default(false),
});
export type RequestUploadInput = z.infer<typeof requestUploadInput>;

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
