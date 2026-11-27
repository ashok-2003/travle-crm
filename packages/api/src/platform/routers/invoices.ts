// The console's billing details and invoices, made by hand: money, so super admins only.
import {
  billingDetails,
  billingImageLinkInput,
  billingImageUploadLink as billingImageUploadLinkOutput,
  billingImageUploadLinkInput,
  cancelInvoiceInput,
  createInvoiceInput,
  invoiceDetail,
  invoiceDownloadLink as invoiceDownloadLinkOutput,
  invoiceIdInput,
  invoicePage,
  listInvoicesInput,
  setBillingDetailsInput,
} from "@travel-crm/contracts/platform";
import {
  billingImageLink,
  billingImageUploadLink,
  cancelInvoice,
  createInvoice,
  getBillingDetails,
  getInvoice,
  invoiceDownloadLink,
  listInvoices,
  setBillingDetails,
} from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const invoicesRouter = platformT.router({
  /** The saved billing details, or null before the first save. */
  billingDetails: superAdminProcedure
    .output(billingDetails.nullable())
    .query(({ ctx }) => getBillingDetails(ctx.services)),
  setBillingDetails: superAdminProcedure
    .input(setBillingDetailsInput)
    .output(billingDetails)
    .mutation(({ ctx, input }) => setBillingDetails(ctx.services, ctx.staff, input)),
  /** A link to PUT the logo or signature to, straight to storage, and the key to save once it has arrived. */
  billingImageUploadLink: superAdminProcedure
    .input(billingImageUploadLinkInput)
    .output(billingImageUploadLinkOutput)
    .mutation(({ ctx, input }) => billingImageUploadLink(ctx.services, input)),
  /** A short-lived link to show the saved logo or signature from; null when none is saved. */
  billingImageLink: superAdminProcedure
    .input(billingImageLinkInput)
    .output(invoiceDownloadLinkOutput.nullable())
    .query(({ ctx, input }) =>
      getBillingDetails(ctx.services).then((saved) => billingImageLink(ctx.services, saved, input.kind)),
    ),
  list: superAdminProcedure
    .input(listInvoicesInput)
    .output(invoicePage)
    .query(({ ctx, input }) => listInvoices(ctx.services, input)),
  get: superAdminProcedure
    .input(invoiceIdInput)
    .output(invoiceDetail)
    .query(({ ctx, input }) => getInvoice(ctx.services, input.invoiceId)),
  create: superAdminProcedure
    .input(createInvoiceInput)
    .output(invoiceDetail)
    .mutation(({ ctx, input }) => createInvoice(ctx.services, ctx.staff, input)),
  cancel: superAdminProcedure
    .input(cancelInvoiceInput)
    .output(invoiceDetail)
    .mutation(({ ctx, input }) => cancelInvoice(ctx.services, ctx.staff, input)),
  downloadLink: superAdminProcedure
    .input(invoiceIdInput)
    .output(invoiceDownloadLinkOutput)
    .query(({ ctx, input }) => invoiceDownloadLink(ctx.services, input.invoiceId)),
});
