// The recording or screenshot "Fill it for me" reads: an attachment of record type ai_input that goes from the browser straight
// to storage (CLAUDE.md: never through the api). Step one records the pending file and hands out the upload; step two checks it
// arrived as promised. Kept 30 days, then deleted by the console's nightly sweep; erased with the customer or the organization.
import {
  AI_INPUT_RECORD_TYPE,
  aiInputAudioTypes,
  MAX_AI_AUDIO_BYTES,
  MAX_AI_IMAGE_BYTES,
} from "@travel-crm/contracts/files";
import type { ConfirmAiInputInput, RequestAiInputInput } from "@travel-crm/contracts/ai";
import type { Files } from "../../files/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, newUuidV7 } from "../../kernel/index.js";

export async function requestAiInput({ files }: { files: Files }, access: MemberAccess, input: RequestAiInputInput) {
  const isAudio = (aiInputAudioTypes as readonly string[]).includes(input.contentType);
  const limit = isAudio ? MAX_AI_AUDIO_BYTES : MAX_AI_IMAGE_BYTES;
  if (input.sizeBytes > limit) {
    throw new DomainError(
      "VALIDATION",
      "AI_INPUT_TOO_LARGE",
      isAudio ? "A recording is at most 2 minutes" : "A screenshot is at most 5 MB",
    );
  }
  const recordId = newUuidV7();
  const { attachment, upload } = await files.requestUpload(access, {
    recordType: AI_INPUT_RECORD_TYPE,
    recordId,
    fileName: isAudio ? "recording.wav" : `screenshot.${input.contentType.slice("image/".length)}`,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return { recordId, attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

export async function confirmAiInput({ files }: { files: Files }, access: MemberAccess, input: ConfirmAiInputInput) {
  await files.confirmUpload(access, {
    recordType: AI_INPUT_RECORD_TYPE,
    recordId: input.recordId,
    attachmentId: input.attachmentId,
  });
}
