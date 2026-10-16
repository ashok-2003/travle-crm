// What a chosen file must be before it is sent (spec 9.2, ADR 0011), by the api's own rules: one of the types staff
// may upload, not empty, at most 25 MB, and a name without folders, control or direction characters. Storage then
// holds the upload to the type and size it was signed for.
import {
  attachmentContentTypes,
  attachmentFileName,
  MAX_ATTACHMENT_BYTES,
  type AttachmentContentType,
} from "@travel-crm/contracts/files";

/** Message keys in "business.attachments.problems". */
export type AttachmentFileProblem = "type" | "size" | "empty" | "name";

/** Message keys in "business.attachments.kinds". */
export type AttachmentKind = "pdf" | "jpeg" | "png" | "webp" | "heic" | "other";

const isAllowedType = (type: string): type is AttachmentContentType =>
  (attachmentContentTypes as readonly string[]).includes(type);

/** The type to sign the upload for. Browsers that can't open HEIC photos give them no type: the name says it. */
function contentTypeOf(file: { name: string; type: string }): AttachmentContentType | null {
  const type = file.type.toLowerCase();
  if (isAllowedType(type)) return type;
  return type === "" && /\.heic$/i.test(file.name) ? "image/heic" : null;
}

export function checkAttachmentFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; contentType: AttachmentContentType } | { ok: false; problem: AttachmentFileProblem } {
  const contentType = contentTypeOf(file);
  if (contentType === null) return { ok: false, problem: "type" };
  if (file.size === 0) return { ok: false, problem: "empty" };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, problem: "size" };
  if (!attachmentFileName.safeParse(file.name).success) return { ok: false, problem: "name" };
  return { ok: true, contentType };
}

const kinds: Record<AttachmentContentType, AttachmentKind> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** A file's kind as people know it ("PDF", "JPEG image"), from the type it was stored with. */
export function kindOf(contentType: string): AttachmentKind {
  return isAllowedType(contentType) ? kinds[contentType] : "other";
}

/** What the file picker offers: the allowed types, and HEIC photos by name for browsers that give them no type. */
export const ACCEPTED_FILES = [...attachmentContentTypes, ".heic"].join(",");
