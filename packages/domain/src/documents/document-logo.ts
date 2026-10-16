// The organization's logo for a document's PDF: the bytes of the logo frozen in its branding, read from storage
// when the worker renders it, and drawn as the image they really are; and the check an upload passes to become it.
import { isLogoSizeAllowed, LOGO_RECORD_TYPE } from "@travel-crm/contracts/profile";
import { imageOf, type DocumentBranding } from "@travel-crm/integrations/pdf";
import type { Files } from "../files/index.js";
import { DomainError } from "../kernel/index.js";

/**
 * The upload's check before a file becomes the logo: the image its type declared, of at most the logo's pixels
 * (`isLogoSizeAllowed`), read from its header before anything decodes it.
 */
export function assertUsableLogo(body: Uint8Array, declaredType: string): void {
  const image = imageOf(body);
  if (image?.contentType !== declaredType) {
    throw new DomainError("VALIDATION", "UPLOAD_DOES_NOT_MATCH", "The stored file isn't the image that was announced");
  }
  if (!isLogoSizeAllowed(image)) {
    throw new DomainError("VALIDATION", "LOGO_TOO_LARGE", "A logo has at most 4096 pixels a side, 16 million in all");
  }
}

/**
 * The logo to draw, or undefined to leave it out. Only the organization's own logo is read (its record is the
 * organization), so a frozen id that names any other file, a passport scan, is never printed. A logo removed since
 * the document was issued, whose bytes aren't a PNG or JPEG (storage checks only the declared type), or with more
 * pixels than a logo may hold (React-PDF would inflate them all) is left out, and the document still renders.
 * Anything else, storage failing, is thrown, so the job is retried.
 */
export async function documentLogo(
  files: Pick<Files, "systemFile">,
  organizationId: string,
  logoAttachmentId: string | undefined,
): Promise<DocumentBranding["logo"]> {
  if (logoAttachmentId === undefined) return undefined;
  let body: Uint8Array;
  try {
    ({ body } = await files.systemFile(organizationId, {
      recordType: LOGO_RECORD_TYPE,
      recordId: organizationId,
      attachmentId: logoAttachmentId,
    }));
  } catch (error) {
    if (error instanceof DomainError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) return undefined;
    throw error;
  }
  const image = imageOf(body);
  return image === null || !isLogoSizeAllowed(image) ? undefined : { data: body, contentType: image.contentType };
}
