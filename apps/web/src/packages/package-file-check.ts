// What a brochure or a payment QR picture may be, checked in the browser before anything is sent: the types and size the
// api accepts, so a wrong file is said so at once and never uploaded. The QR is the agency's (setup's payment step).
import {
  MAX_PACKAGE_BROCHURE_BYTES,
  MAX_PACKAGE_PAYMENT_QR_BYTES,
  packageBrochureContentTypes,
  packagePaymentQrContentTypes,
} from "@travel-crm/contracts/files";
import type { PackageFileKind } from "@travel-crm/contracts/quotes";

/** Why a file can't be used; also its message key. */
export type PackageFileProblem = "wrongType" | "tooLarge";

type CheckedKind = PackageFileKind | "payment_qr";

const typesOf: Record<CheckedKind, readonly string[]> = {
  brochure: packageBrochureContentTypes,
  payment_qr: packagePaymentQrContentTypes,
};
export const packageFileLimit: Record<CheckedKind, number> = {
  brochure: MAX_PACKAGE_BROCHURE_BYTES,
  payment_qr: MAX_PACKAGE_PAYMENT_QR_BYTES,
};

export function packageFileProblem(kind: CheckedKind, file: { type: string; size: number }): PackageFileProblem | null {
  // An empty file is not a file of any type.
  if (!typesOf[kind].includes(file.type) || file.size === 0) return "wrongType";
  return file.size > packageFileLimit[kind] ? "tooLarge" : null;
}
