// organization.paymentDetails.*: the agency's UPI ID, bank account and payment QR, kept once for the AI agent to quote
// with an advance. Bank details are in it, so every procedure needs settings:manage and a change reads the session
// afresh. The QR goes straight to storage like the logo (organization.logo): the api hands out the links.
import {
  paymentDetails,
  paymentQrRefInput,
  paymentQrUpload,
  requestPaymentQrUploadInput,
  savePaymentDetailsInput,
} from "@travel-crm/contracts/profile";
import { confirmPaymentQr, readPaymentDetails, removePaymentQr, savePaymentDetails } from "@travel-crm/domain/profile";
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const paymentDetailsRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(paymentDetails)
    .query(({ ctx }) => readPaymentDetails(ctx, ctx.member)),

  save: freshProcedure
    .requires("settings:manage")
    .input(savePaymentDetailsInput)
    .output(paymentDetails)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => savePaymentDetails(tx, ctx.member, input));
      return readPaymentDetails(ctx, ctx.member);
    }),

  /** Where the browser PUTs the QR; it counts toward the organization's storage like any file. */
  requestQrUpload: freshProcedure
    .requires("settings:manage")
    .input(requestPaymentQrUploadInput)
    .output(paymentQrUpload)
    .mutation(async ({ ctx, input }) => {
      const { attachment, upload } = await ctx.files.requestUpload(ctx.member, {
        recordType: AGENCY_PAYMENT_QR_RECORD_TYPE,
        recordId: ctx.member.organizationId,
        ...input,
        sensitive: false,
      });
      return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
    }),

  /** Once storage holds the promised picture it is the QR; the older one goes. Harmless to repeat. */
  confirmQr: freshProcedure
    .requires("settings:manage")
    .input(paymentQrRefInput)
    .output(paymentDetails)
    .mutation(async ({ ctx, input }) => {
      await confirmPaymentQr(ctx, ctx.member, input.attachmentId);
      return readPaymentDetails(ctx, ctx.member);
    }),

  removeQr: freshProcedure
    .requires("settings:manage")
    .input(paymentQrRefInput)
    .output(paymentDetails)
    .mutation(async ({ ctx, input }) => {
      await removePaymentQr(ctx, ctx.member, input.attachmentId);
      return readPaymentDetails(ctx, ctx.member);
    }),
});
