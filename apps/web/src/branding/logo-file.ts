// What may be sent as the logo, checked before anything is: the type and size the api accepts, and a name storage can
// keep. A file's own name may hold direction marks, which the api refuses; the logo's name matters to nobody.
import { attachmentFileName } from "@travel-crm/contracts/files";
import {
  logoContentTypes,
  MAX_LOGO_BYTES,
  type LogoContentType,
  type RequestLogoUploadInput,
} from "@travel-crm/contracts/profile";

/** Why a file can't be the logo; also its message key in "documents.branding.logo". */
export type LogoProblem = "wrongType" | "tooLarge";

const isLogoType = (type: string): type is LogoContentType => (logoContentTypes as readonly string[]).includes(type);

export function logoUploadOf(
  file: File,
): { ok: true; input: RequestLogoUploadInput } | { ok: false; problem: LogoProblem } {
  const contentType = file.type;
  // An empty file isn't an image of any type.
  if (!isLogoType(contentType) || file.size === 0) return { ok: false, problem: "wrongType" };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, problem: "tooLarge" };
  const name = attachmentFileName.safeParse(file.name);
  const fileName = name.success ? name.data : `Logo.${contentType === "image/png" ? "png" : "jpg"}`;
  return { ok: true, input: { fileName, contentType, sizeBytes: file.size } };
}
