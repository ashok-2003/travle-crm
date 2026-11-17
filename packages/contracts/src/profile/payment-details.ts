// The agency's payment details, kept once for the whole agency (lite agent, plan 2): a UPI ID, the bank account (the
// profile's own columns) and a QR picture. The agent quotes them with the advance it asks for.
import { z } from "zod";
import { MAX_PACKAGE_PAYMENT_QR_BYTES, packagePaymentQrContentTypes } from "../files/attachments.js";
import { attachmentFileName, presignedUpload } from "../files/index.js";
import { recordId } from "../identity/index.js";
import { bankAccountNumber, bankIfsc, optional, optionalText } from "./profile.js";

export { AGENCY_PAYMENT_QR_RECORD_TYPE } from "../files/attachments.js";

/** A UPI ID such as "sharma.holidays@okbank": a handle, "@", the bank's short name. */
export const upiIdField = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/, "Check the UPI ID, like name@bank");

export const paymentDetails = z.object({
  upiId: z.string().nullable(),
  bankName: z.string().nullable(),
  accountName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  ifsc: z.string().nullable(),
  qr: z.object({ id: recordId, fileName: z.string(), url: z.string() }).nullable(),
  /** Whether the agent has somewhere to send a customer's advance: a UPI ID, a QR or the whole bank account. */
  ready: z.boolean(),
});
export type PaymentDetails = z.infer<typeof paymentDetails>;

/** A blank box is no value, as on the profile screen; the bank values are checked as the profile checks them. */
export const savePaymentDetailsInput = z.strictObject({
  upiId: optional(upiIdField),
  bankName: optionalText(120),
  accountName: optionalText(120),
  accountNumber: optional(bankAccountNumber),
  ifsc: optional(bankIfsc),
});
export type SavePaymentDetailsInput = z.infer<typeof savePaymentDetailsInput>;

export const requestPaymentQrUploadInput = z.strictObject({
  fileName: attachmentFileName,
  contentType: z.enum(packagePaymentQrContentTypes),
  sizeBytes: z.number().int().min(1).max(MAX_PACKAGE_PAYMENT_QR_BYTES),
});
export type RequestPaymentQrUploadInput = z.infer<typeof requestPaymentQrUploadInput>;

/** An uploaded QR by its attachment: to confirm it arrived, or to remove it. */
export const paymentQrRefInput = z.strictObject({ attachmentId: recordId });
export type PaymentQrRefInput = z.infer<typeof paymentQrRefInput>;

/** Where the browser PUTs the QR, and the attachment to confirm afterwards. */
export const paymentQrUpload = z.object({ attachmentId: recordId, upload: presignedUpload });
export type PaymentQrUpload = z.infer<typeof paymentQrUpload>;
