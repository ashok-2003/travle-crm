// documents.*: the organization's issued documents (spec 9.3), each with its PDF and its share links, for the
// documents screen; and the sample quotation the branding screen previews the branding on. Every issued document today
// is such a sample, so settings:manage covers them; quotes and invoices bring their own permissions.
import {
  documentRefInput,
  issuedDocumentPage,
  issuedDocumentSummary,
  listIssuedDocumentsInput,
  SAMPLE_DOCUMENT_PREFIX,
} from "@travel-crm/contracts/documents";
import { downloadLink } from "@travel-crm/contracts/files";
import {
  assertMayIssueSample,
  brandedSampleQuotation,
  getIssuedDocument,
  issueDocument,
  listIssuedDocuments,
} from "@travel-crm/domain/documents";
import { DomainError } from "@travel-crm/domain/kernel";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { currentLogo } from "./logo.js";

export const documentsRouter = router({
  /**
   * Issues a sample quotation with the branding as saved now, logo included, numbered SMPL-<year>-<n>. It is kept like
   * every issued document: what was issued is never removed. So at most SAMPLES_PER_DAY in any 24 hours.
   */
  issueSample: freshProcedure
    .requires("settings:manage")
    .output(issuedDocumentSummary)
    .mutation(async ({ ctx }) => {
      const { organizationId } = ctx.member;
      const [profile, organization, logo] = await Promise.all([
        ctx.profiles.get(organizationId),
        ctx.identity.organizationProfile(organizationId),
        currentLogo(ctx.files, ctx.member),
      ]);
      // The sample is taxed in the organization's GST state, which the business details hold.
      if (!profile) {
        throw new DomainError("CONFLICT", "PROFILE_NOT_SAVED", "Save the business details before a sample");
      }
      const sample = brandedSampleQuotation({
        organizationName: organization?.name ?? profile.legalName,
        profile,
        logoAttachmentId: logo?.id,
      });
      return ctx.db.forOrg(organizationId, async (tx) => {
        await assertMayIssueSample(tx);
        return issueDocument(tx, ctx.member, { ...sample, prefix: SAMPLE_DOCUMENT_PREFIX });
      });
    }),

  /**
   * The organization's documents, newest first. It is how the Owner finds the PDFs to take away and the links to turn
   * off, so it is of the export kind: allowed while read-only, and to the Owner while suspended (ADR 0021).
   */
  list: orgProcedure
    .requires("settings:manage")
    .meta({ lifecycle: "export" })
    .input(listIssuedDocumentsInput)
    .output(issuedDocumentPage)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listIssuedDocuments(tx, input))),

  /** One document, which the screen asks for again while the worker prepares its PDF. */
  get: orgProcedure
    .requires("settings:manage")
    .input(documentRefInput)
    .output(issuedDocumentSummary)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => getIssuedDocument(tx, input))),

  /**
   * A five-minute link that downloads the rendered PDF under the document's number: an export, as the organization's
   * papers are, so a suspended organization's Owner can still take its PDFs. Like attachments.downloadLink, a mutation
   * (so no link is cached or saved on the device) from a session read afresh, as every export is (spec 6.4).
   */
  downloadLink: freshProcedure
    .requires("settings:manage")
    .meta({ lifecycle: "export" })
    .input(documentRefInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.forOrg(ctx.member.organizationId, (tx) => getIssuedDocument(tx, input));
      if (document.renderFailed) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_UNAVAILABLE", "The document's PDF can't be made");
      }
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await ctx.files.downloadLink(ctx.member, {
        recordType: "issued_document",
        recordId: document.id,
        attachmentId: document.pdfAttachmentId,
      });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),
});
