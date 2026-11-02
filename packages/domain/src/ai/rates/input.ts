// The file a rate sheet is read from: an attachment of record type ai_input that goes from the browser straight to storage (never
// through the api): a PDF or an Excel file of at most 10 MB, or a photo of at most 5 MB. Kept 30 days, then deleted by the nightly sweep.
import {
  AI_INPUT_RECORD_TYPE,
  aiInputImageTypes,
  MAX_AI_IMAGE_BYTES,
  MAX_AI_RATE_SHEET_BYTES,
} from "@travel-crm/contracts/files";
import type { RequestRateSheetInput } from "@travel-crm/contracts/ai";
import type { Files } from "../../files/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, newUuidV7 } from "../../kernel/index.js";

const fileNames: Record<string, string> = {
  "application/pdf": "rate-sheet.pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "rate-sheet.xlsx",
};

export async function requestRateSheetUpload(
  { files }: { files: Files },
  access: MemberAccess,
  input: RequestRateSheetInput,
) {
  const isPhoto = (aiInputImageTypes as readonly string[]).includes(input.contentType);
  if (input.sizeBytes > (isPhoto ? MAX_AI_IMAGE_BYTES : MAX_AI_RATE_SHEET_BYTES)) {
    throw new DomainError(
      "VALIDATION",
      "AI_INPUT_TOO_LARGE",
      isPhoto ? "A photo is at most 5 MB" : "A rate sheet file is at most 10 MB",
    );
  }
  const recordId = newUuidV7();
  const { attachment, upload } = await files.requestUpload(access, {
    recordType: AI_INPUT_RECORD_TYPE,
    recordId,
    fileName: fileNames[input.contentType] ?? `rate-sheet-photo.${input.contentType.slice("image/".length)}`,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { recordId, attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}
