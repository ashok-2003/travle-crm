// The firm's logo and signature images for its invoices: a presigned upload under the platform's own prefix (never an
// organization's files), the check that a saved key is such an image, and the bytes the PDF draws.
import {
  MAX_BILLING_IMAGE_BYTES,
  type BillingDetails,
  type BillingImageKind,
  type BillingImageUploadLink,
  type BillingImageUploadLinkInput,
} from "@travel-crm/contracts/platform";
import { imageOf, isSafeToDraw, type PlatformInvoiceImage } from "@travel-crm/integrations/pdf";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { DomainError, newUuidV7 } from "../kernel/index.js";
import type { PlatformServices } from "./services.js";

/** Long enough for a slow connection to send 1 MB. */
const UPLOAD_URL_SECONDS = 10 * 60;

const extensionOf = { "image/png": "png", "image/jpeg": "jpg" } as const;
const contentTypeOf = { png: "image/png", jpg: "image/jpeg" } as const;

/** `platform/billing/logo-<uuid>.png`: the only shape a saved key may have, for its own kind. */
const keyPattern = (kind: BillingImageKind) =>
  new RegExp(`^platform/billing/${kind}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg)$`);

const invalid = (): DomainError =>
  new DomainError(
    "VALIDATION",
    "BILLING_IMAGE_INVALID",
    "The logo and signature are PNG or JPEG images of at most 1 MB",
  );

/** A link the browser PUTs one image to, and the key to save on the billing details once it has. */
export async function billingImageUploadLink(
  services: PlatformServices,
  input: BillingImageUploadLinkInput,
): Promise<BillingImageUploadLink> {
  const key = `platform/billing/${input.kind}-${newUuidV7()}.${extensionOf[input.contentType]}`;
  const upload = await services.storage.presignUpload(
    { key, contentType: input.contentType, sizeBytes: input.sizeBytes },
    UPLOAD_URL_SECONDS,
  );
  return { ...upload, expiresAt: upload.expiresAt.toISOString(), key };
}

/**
 * Refuses a key that isn't this kind's own, an object that isn't stored, one over 1 MB, and one whose bytes aren't a
 * PNG or JPEG of the type its key says (a renamed PDF), before the key is saved. Reads only what is small enough.
 */
async function assertImage(storage: ObjectStorage, kind: BillingImageKind, key: string): Promise<void> {
  const match = keyPattern(kind).exec(key);
  if (match === null) throw invalid();
  const stored = await storage.head(key);
  if (stored === null || stored.sizeBytes > MAX_BILLING_IMAGE_BYTES) throw invalid();
  const bytes = await storage.get(key);
  if (bytes === null || bytes.byteLength > MAX_BILLING_IMAGE_BYTES) throw invalid();
  const extension = match[1] === "png" ? "png" : "jpg";
  if (imageOf(bytes)?.contentType !== contentTypeOf[extension] || !(await isSafeToDraw(bytes))) throw invalid();
}

/** Checks the images the new details name that the saved ones didn't (a saved one was checked when it was saved). */
export async function assertBillingImages(
  storage: ObjectStorage,
  next: Pick<BillingDetails, "logoKey" | "signatureKey">,
  before: Pick<BillingDetails, "logoKey" | "signatureKey"> | null,
): Promise<void> {
  if (next.logoKey !== null && next.logoKey !== before?.logoKey) await assertImage(storage, "logo", next.logoKey);
  if (next.signatureKey !== null && next.signatureKey !== before?.signatureKey) {
    await assertImage(storage, "signature", next.signatureKey);
  }
}

/** Removes the images a save no longer names, once it is saved. A file that can't be removed is only left behind. */
export async function deleteReplacedImages(
  services: PlatformServices,
  before: Pick<BillingDetails, "logoKey" | "signatureKey"> | null,
  next: Pick<BillingDetails, "logoKey" | "signatureKey">,
): Promise<void> {
  const replaced = [
    before?.logoKey !== next.logoKey ? before?.logoKey : null,
    before?.signatureKey !== next.signatureKey ? before?.signatureKey : null,
  ];
  for (const key of replaced) {
    if (key === null || key === undefined) continue;
    try {
      await services.storage.delete(key);
    } catch {
      // Left behind in storage, unlinked; nothing shows it.
    }
  }
}

/** The image's bytes for the PDF; none when none is set, or when storage no longer holds it. */
export async function billingImageForPdf(
  storage: ObjectStorage,
  key: string | null,
): Promise<PlatformInvoiceImage | undefined> {
  if (key === null) return undefined;
  const data = await storage.get(key);
  const contentType = imageOf(data ?? new Uint8Array())?.contentType;
  return data === null || contentType === undefined ? undefined : { data, contentType };
}

/** A short-lived link the console shows the saved image from; null when none is saved. */
export async function billingImageLink(
  services: PlatformServices,
  details: BillingDetails | null,
  kind: BillingImageKind,
): Promise<{ url: string } | null> {
  const key = kind === "logo" ? details?.logoKey : details?.signatureKey;
  if (key === null || key === undefined) return null;
  const contentType = key.endsWith(".png") ? "image/png" : "image/jpeg";
  const url = await services.storage.presignDownload(
    { key, fileName: `${kind}.${key.endsWith(".png") ? "png" : "jpg"}`, inline: true, contentType },
    300,
  );
  return { url };
}
