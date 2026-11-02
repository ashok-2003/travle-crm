// quotes.*: a lead's quotations (step 3, P0): written by whoever may make and change quotes, seen within quotes:view's
// scope (the lead's owner), shared with the customer by link (/p/<token>), and the money on them: what is due, what was
// paid (recorded from a session read afresh, as money is), the quotation's PDF, its tax invoice and each receipt.
import { downloadLink } from "@travel-crm/contracts/files";
import {
  addInstallmentInput,
  createQuoteInput,
  installmentIdInput,
  leadQuotesInput,
  listQuotesInput,
  moneySummary,
  moneySummaryInput,
  packageIdInput,
  quoteFromPackageInput,
  quotePackageList,
  savePackageInput,
  paymentIdInput,
  quoteDetail,
  quoteDocument,
  quoteIdInput,
  quoteLink,
  quoteList,
  quoteSettings,
  recordPaymentInput,
  saveQuoteSettingsInput,
  setQuoteStatusInput,
  updateQuoteInput,
} from "@travel-crm/contracts/quotes";
import { z } from "zod";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { calendarDateIn, DomainError } from "@travel-crm/domain/kernel";
import {
  addInstallment,
  assertQuoteDocument,
  createQuote,
  deletePackage,
  deleteQuote,
  duplicateQuote,
  listPackages,
  quoteFromPackage,
  savePackage,
  getQuote,
  issuePaymentReceipt,
  issueQuoteInvoice,
  issueQuotePdf,
  listLeadQuotes,
  listQuotes,
  moneySummaryOf,
  newQuoteVersion,
  QUOTE_RECORD_TYPE,
  quoteSettingsOf,
  recordPayment,
  removeInstallment,
  saveQuoteSettings,
  setQuoteStatus,
  updateQuote,
  voidPayment,
  type DocumentContext,
} from "@travel-crm/domain/quotes";
import { createShareLink } from "@travel-crm/domain/share-links";
import type { Context } from "../context.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { currentLogo } from "./logo.js";

type MemberContext = Pick<Context, "db" | "files" | "identity" | "profiles"> & { member: MemberAccess };

const viewer = orgProcedure.requires("quotes:view");
const maker = orgProcedure.requires("quotes:create");
const editor = orgProcedure.requires("quotes:edit");
// What changes a quote or its money is read from the database, never the five-minute session cache.
const moneyEditor = freshProcedure.requires("quotes:edit");
const paymentRecorder = freshProcedure.requires("quotes:record_payments");

/** What every quote write needs: the agency's GST state, from its business details. */
export async function quoteContext(ctx: MemberContext) {
  const profile = await ctx.profiles.get(ctx.member.organizationId);
  return { supplierStateCode: profile?.gstStateCode ?? null, now: new Date() };
}

/** The agency's name, colour, terms and logo as they are now, frozen into a document issued with them. */
export async function documentContext(ctx: MemberContext): Promise<DocumentContext> {
  const { organizationId } = ctx.member;
  const [profile, organization, logo, settings] = await Promise.all([
    ctx.profiles.get(organizationId),
    ctx.identity.organizationProfile(organizationId),
    currentLogo(ctx.files, ctx.member),
    ctx.db.forOrg(organizationId, (tx) => quoteSettingsOf(tx)),
  ]);
  if (!profile) throw new DomainError("CONFLICT", "PROFILE_NOT_SAVED", "Save the business details first");
  const terms = settings.defaultTerms !== "" ? settings.defaultTerms : profile.documentTerms;
  return {
    branding: {
      organizationName: organization?.name ?? profile.legalName,
      ...(profile.brandColour === null ? {} : { accentColour: profile.brandColour }),
      ...(terms === null || terms === "" ? {} : { terms }),
      ...(logo === undefined ? {} : { logoAttachmentId: logo.id }),
    },
    supplierStateCode: profile.gstStateCode,
    gstin: profile.gstin,
    invoicePrefix: profile.invoicePrefix,
    now: new Date(),
  };
}

export const quotesRouter = router({
  list: viewer
    .input(listQuotesInput)
    .output(quoteList)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listQuotes(tx, ctx.member, input))),

  forLead: viewer
    .input(leadQuotesInput)
    .output(quoteList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listLeadQuotes(tx, ctx.member, input.leadId)),
    ),

  get: viewer
    .input(quoteIdInput)
    .output(quoteDetail)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => getQuote(tx, ctx.member, input.quoteId)),
    ),

  create: maker
    .input(createQuoteInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => createQuote(tx, ctx.member, input, context));
    }),

  update: moneyEditor
    .input(updateQuoteInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => updateQuote(tx, ctx.member, input, context));
    }),

  setStatus: editor
    .input(setQuoteStatusInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        setQuoteStatus(tx, ctx.member, input, context.now, context.supplierStateCode),
      );
    }),

  delete: moneyEditor
    .input(quoteIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteQuote(tx, ctx.member, input.quoteId)),
    ),

  /** A link the customer opens without signing in, to read the quote, pay by UPI and accept it. A draft becomes sent. */
  share: moneyEditor
    .input(quoteIdInput)
    .output(quoteLink)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const quote = await getQuote(tx, ctx.member, input.quoteId);
        if (quote.status === "draft") {
          await setQuoteStatus(
            tx,
            ctx.member,
            { quoteId: quote.id, status: "sent" },
            context.now,
            context.supplierStateCode,
          );
        }
        const link = await createShareLink(tx, ctx.member, {
          recordType: QUOTE_RECORD_TYPE,
          recordId: quote.id,
          label: `Quote: ${quote.title}`.slice(0, 120),
          // A quote is open for 90 days: a customer may come back to pay the balance.
          expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
        });
        return { path: link.path };
      });
    }),

  addInstallment: moneyEditor
    .input(addInstallmentInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => addInstallment(tx, ctx.member, input)),
    ),

  removeInstallment: moneyEditor
    .input(installmentIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removeInstallment(tx, ctx.member, input.installmentId)),
    ),

  recordPayment: paymentRecorder
    .input(recordPaymentInput)
    .output(z.object({ paymentId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => recordPayment(tx, ctx.member, input, new Date())),
    ),

  /** A payment recorded by mistake is voided, never deleted (and not once its receipt is issued). */
  voidPayment: paymentRecorder
    .input(paymentIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => voidPayment(tx, ctx.member, input.paymentId, new Date())),
    ),

  issuePdf: moneyEditor
    .input(quoteIdInput)
    .output(quoteDocument)
    .mutation(async ({ ctx, input }) => {
      const context = await documentContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => issueQuotePdf(tx, ctx.member, input.quoteId, context));
    }),

  issueInvoice: paymentRecorder
    .input(quoteIdInput)
    .output(quoteDocument)
    .mutation(async ({ ctx, input }) => {
      const context = await documentContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        issueQuoteInvoice(tx, ctx.member, input.quoteId, context),
      );
    }),

  issueReceipt: paymentRecorder
    .input(paymentIdInput)
    .output(quoteDocument)
    .mutation(async ({ ctx, input }) => {
      const context = await documentContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        issuePaymentReceipt(tx, ctx.member, input.paymentId, context),
      );
    }),

  /** A five-minute link to one of the quote's PDFs; DOCUMENT_NOT_READY while the worker still renders it. */
  documentLink: freshProcedure
    .requires("quotes:view")
    .meta({ lifecycle: "export" })
    .input(z.strictObject({ quoteId: z.uuid(), documentId: z.uuid() }))
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        await assertQuoteDocument(tx, ctx.member, input.quoteId, input.documentId);
        return getIssuedDocument(tx, { documentId: input.documentId });
      });
      assertPdfCanBeMade(document);
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await ctx.files.systemDownloadLink(ctx.member.organizationId, {
        attachmentId: document.pdfAttachmentId,
      });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),

  /** The agency's ready packages, a quote starts from in a tap. */
  packages: viewer
    .output(quotePackageList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listPackages(tx))),

  savePackage: editor
    .input(savePackageInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => savePackage(tx, ctx.member, input))),

  deletePackage: editor
    .input(packageIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deletePackage(tx, ctx.member, input.packageId)),
    ),

  fromPackage: maker
    .input(quoteFromPackageInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => quoteFromPackage(tx, ctx.member, input, context));
    }),

  /** A sent quote keeps its prices: a new version is a draft copy that replaces it, and its link says so. */
  newVersion: freshProcedure
    .requires("quotes:create", "quotes:edit")
    .input(quoteIdInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => newQuoteVersion(tx, ctx.member, input.quoteId, context));
    }),

  /** Another option of the quote, which the customer's link shows beside it. */
  duplicate: maker
    .input(quoteIdInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => duplicateQuote(tx, ctx.member, input.quoteId, context));
    }),

  settings: viewer
    .output(quoteSettings)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => quoteSettingsOf(tx))),

  saveSettings: freshProcedure
    .requires("settings:manage")
    .input(saveQuoteSettingsInput)
    .output(quoteSettings)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveQuoteSettings(tx, ctx.member, input)),
    ),

  /** The dashboard's money: accepted, received, still to come and overdue. */
  moneySummary: freshProcedure
    .requires("quotes:view", "money:view_reports")
    .input(moneySummaryInput)
    .output(moneySummary)
    .query(async ({ ctx, input }) => {
      const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
      const today = calendarDateIn(new Date(), timeZone);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        moneySummaryOf(tx, ctx.member, { from: input.from, to: input.to, today, timeZone }),
      );
    }),
});
