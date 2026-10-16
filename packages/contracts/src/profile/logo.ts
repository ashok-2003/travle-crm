// The organization's logo on its documents (spec 9.3): a PNG or JPEG of at most 1 MB, sent straight to storage as an
// attachment of record type organization_logo whose record is the organization. The newest ready one is the logo.
import { z } from "zod";
import { attachmentFileName, presignedUpload } from "../files/index.js";

/** The images React-PDF draws: PNG and JPEG. Not SVG, which can carry scripts, nor WebP or HEIC, which it can't draw. */
export const logoContentTypes = ["image/png", "image/jpeg"] as const;
export type LogoContentType = (typeof logoContentTypes)[number];

/** The largest logo: 1 MB, plenty for a header 40 points high, and quick for the worker to read for every PDF. */
export const MAX_LOGO_BYTES = 1024 * 1024;

/** The record type logos are attached to; the record is the organization itself. */
export const LOGO_RECORD_TYPE = "organization_logo";

export const requestLogoUploadInput = z.strictObject({
  fileName: attachmentFileName,
  contentType: z.enum(logoContentTypes),
  sizeBytes: z.number().int().min(1).max(MAX_LOGO_BYTES),
});
export type RequestLogoUploadInput = z.infer<typeof requestLogoUploadInput>;

/** An uploaded logo, by its attachment: to confirm it arrived, or to remove it. */
export const logoRefInput = z.strictObject({ attachmentId: z.uuid() });
export type LogoRefInput = z.infer<typeof logoRefInput>;

/** Where the browser PUTs the logo, and the attachment to confirm afterwards. */
export const logoUpload = z.object({ attachmentId: z.uuid(), upload: presignedUpload });
export type LogoUpload = z.infer<typeof logoUpload>;

/** The logo as the branding screen shows it: through a short-lived link. */
export const organizationLogo = z.object({
  attachmentId: z.uuid(),
  fileName: z.string(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type OrganizationLogo = z.infer<typeof organizationLogo>;
