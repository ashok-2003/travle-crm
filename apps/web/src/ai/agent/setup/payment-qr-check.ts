// What the agency's payment QR picture may be, checked in the browser before anything is sent: the types and size the api
// accepts, so a wrong file is said so at once and never uploaded.
import { MAX_PACKAGE_PAYMENT_QR_BYTES, packagePaymentQrContentTypes } from "@travel-crm/contracts/files";

/** Why a picture can't be used; also its message key. */
export type PaymentQrProblem = "wrongType" | "tooLarge";

export const paymentQrLimit = MAX_PACKAGE_PAYMENT_QR_BYTES;

export function paymentQrProblem(file: { type: string; size: number }): PaymentQrProblem | null {
  // An empty file is not a file of any type.
  if (!packagePaymentQrContentTypes.includes(file.type as never) || file.size === 0) return "wrongType";
  return file.size > paymentQrLimit ? "tooLarge" : null;
}
