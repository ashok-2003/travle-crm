// What a package's brochure or payment QR may be, checked in the browser before anything is sent: the types and size the
// api accepts, so a wrong file is said so at once and never uploaded.
import {
  MAX_PACKAGE_BROCHURE_BYTES,
  MAX_PACKAGE_PAYMENT_QR_BYTES,
  packageBrochureContentTypes,
  packagePaymentQrContentTypes,
} from "@travel-crm/contracts/files";
import type { PackageFileKind } from "@travel-crm/contracts/quotes";

/** Why a file can't be used; also its message key. */
export type PackageFileProblem = "wrongType" | "tooLarge";

const typesOf: Record<PackageFileKind, readonly string[]> = {
  brochure: packageBrochureContentTypes,
  payment_qr: packagePaymentQrContentTypes,
};
export const packageFileLimit: Record<PackageFileKind, number> = {
  brochure: MAX_PACKAGE_BROCHURE_BYTES,
  payment_qr: MAX_PACKAGE_PAYMENT_QR_BYTES,
};

export function packageFileProblem(
  kind: PackageFileKind,
  file: { type: string; size: number },
): PackageFileProblem | null {
  // An empty file is not a file of any type.
  if (!typesOf[kind].includes(file.type) || file.size === 0) return "wrongType";
  return file.size > packageFileLimit[kind] ? "tooLarge" : null;
}
