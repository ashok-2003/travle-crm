// Which record types take which files (spec 5): an import's file is CSV or .xlsx and nothing else is; issued
// documents, import reports and exports are the system's alone; and the bulk files are short-lived, so the platform's
// sweep and erasure delete them for good.
import {
  AI_KNOWLEDGE_RECORD_TYPE,
  AI_INPUT_RECORD_TYPE,
  AI_MEDIA_RECORD_TYPE,
  aiInputFileTypes,
  aiMediaFileTypes,
  aiKnowledgeFileTypes,
  attachmentContentTypes,
  TRIP_KIT_RECORD_TYPE,
  WHATSAPP_RECORD_TYPE,
  whatsappContentTypes,
  MAX_ATTACHMENT_BYTES,
  MAX_IMPORT_BYTES,
  spreadsheetContentTypes,
} from "@travel-crm/contracts/files";

/** An import's uploaded file. */
export const IMPORT_FILE_RECORD_TYPE = "import_batch";
/** An import's report of rows not added (B34). */
export const IMPORT_REPORT_RECORD_TYPE = "import_report";
/** An export's file (B42). */
export const DATA_EXPORT_RECORD_TYPE = "data_export";

const spreadsheetRecordTypes: readonly string[] = [
  IMPORT_FILE_RECORD_TYPE,
  IMPORT_REPORT_RECORD_TYPE,
  DATA_EXPORT_RECORD_TYPE,
];

/**
 * Record types whose files only the system makes and keeps: an issued document's PDF is part of what was issued (ADR
 * 0012), and an import's report and an export are made by the worker. No one uploads or removes one through the
 * generic calls, the system included; the system stores it with storeGeneratedFile.
 */
const SYSTEM_OWNED_RECORD_TYPES: readonly string[] = [
  "issued_document",
  IMPORT_REPORT_RECORD_TYPE,
  DATA_EXPORT_RECORD_TYPE,
];

export function isSystemOwnedRecordType(recordType: string): boolean {
  return SYSTEM_OWNED_RECORD_TYPES.includes(recordType);
}

/** Files kept for days at most (B53, B54): the platform deletes them for good, system-owned or not. */
export function isShortLivedRecordType(recordType: string): boolean {
  return spreadsheetRecordTypes.includes(recordType);
}

/** The largest file a record takes: an import's 10 MB (B2), however its upload is asked for (D11); others 25 MB. */
export function maxUploadBytes(recordType: string): number {
  return recordType === IMPORT_FILE_RECORD_TYPE ? MAX_IMPORT_BYTES : MAX_ATTACHMENT_BYTES;
}

/** The content types a record's files may have: spreadsheets for the bulk files, documents and photos elsewhere. */
export function allowedContentTypes(recordType: string): readonly string[] {
  // The AI reads what it is given: a PDF or plain words.
  if (recordType === AI_KNOWLEDGE_RECORD_TYPE) return aiKnowledgeFileTypes;
  // What "Fill it for me" reads: a WAV recording or a screenshot.
  if (recordType === AI_INPUT_RECORD_TYPE) return aiInputFileTypes;
  // What the AI sends is what WhatsApp takes as a photo, a video or a document.
  if (recordType === AI_MEDIA_RECORD_TYPE) return aiMediaFileTypes;
  // A trip's details are sent on WhatsApp, so they take what a WhatsApp message does (videos and voice notes too).
  if (recordType === WHATSAPP_RECORD_TYPE || recordType === TRIP_KIT_RECORD_TYPE) return whatsappContentTypes;
  return spreadsheetRecordTypes.includes(recordType) ? spreadsheetContentTypes : attachmentContentTypes;
}
