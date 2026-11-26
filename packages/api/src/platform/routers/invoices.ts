// The console's billing details and invoices, made by hand: money, so super admins only.
import {
  billingDetails,
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
