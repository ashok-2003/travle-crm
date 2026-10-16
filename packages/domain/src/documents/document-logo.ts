// The organization's logo for a document's PDF: the bytes of the logo frozen in its branding, read from storage
// when the worker renders it, and drawn as the image they really are; and the check an upload passes to become it.
import { isLogoSizeAllowed, LOGO_RECORD_TYPE } from "@travel-crm/contracts/profile";
import { imageOf, pixelDataFitsHeader, type DocumentBranding } from "@travel-crm/integrations/pdf";
import type { Files } from "../files/index.js";
import { DomainError } from "../kernel/index.js";

/** The stored file isn't the image its upload announced, or not one png-js would read as its header says. */
const notTheImage = () =>
  new DomainError("VALIDATION", "UPLOAD_DOES_NOT_MATCH", "The stored file isn't the image that was announced");

/**
 * The upload's check before a file becomes the logo: the image its type declared, of at most the logo's pixels
 * (`isLogoSizeAllowed`), read from its headers before anything decodes it, and with no more pixel data than they say.
 */
export async function assertUsableLogo(body: Uint8Array, declaredType: string): Promise<void> {
  const image = imageOf(body);
  if (image?.contentType !== declaredType) throw notTheImage();
  if (!isLogoSizeAllowed(image)) {
    throw new DomainError("VALIDATION", "LOGO_TOO_LARGE", "A logo has at most 4096 pixels a side, 16 million in all");
  }
  if (!(await pixelDataFitsHeader(body))) throw notTheImage();
}

/**
 * The logo to draw, or undefined to leave it out. Only the organization's own logo is read (its record is the
 * organization), so a frozen id that names any other file, a passport scan, is never printed. A logo removed since
 * the document was issued, whose bytes aren't a PNG or JPEG png-js reads as their headers say (storage checks only
 * the declared type), with more pixels or pixel data than a logo may hold (React-PDF would inflate them all), or with
 * pixel data png-js would throw at where nothing catches it (any stored before the upload's checks) is left out, and
 * the document still renders. Anything else, storage failing, is thrown, so the job is retried.
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
  if (image === null || !isLogoSizeAllowed(image) || !(await pixelDataFitsHeader(body))) return undefined;
  return { data: body, contentType: image.contentType };
}
