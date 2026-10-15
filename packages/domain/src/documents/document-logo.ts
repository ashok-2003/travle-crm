// The organization's logo for a document's PDF: the bytes of the logo frozen in its branding, read from storage
// when the worker renders it, and drawn as the image they really are.
import { LOGO_RECORD_TYPE } from "@travel-crm/contracts/profile";
import { imageTypeOf, type DocumentBranding } from "@travel-crm/integrations/pdf";
import type { Files } from "../files/index.js";
import { DomainError } from "../kernel/index.js";

/**
 * The logo to draw, or undefined to leave it out. Only the organization's own logo is read (its record is the
 * organization), so a frozen id that names any other file, a passport scan, is never printed. A logo removed since
 * the document was issued, or whose bytes aren't a PNG or JPEG (storage checks only the declared type), is left out
 * and the document still renders. Anything else, storage failing, is thrown, so the job is retried.
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
  const contentType = imageTypeOf(body);
  return contentType === null ? undefined : { data: body, contentType };
}
