// attachments.*: files on any record (spec 9.2): presigned uploads the browser PUTs straight to storage, their
// confirmation, the list of a record's files and their downloads. File bytes never pass through the api. The
// Foundation's one record is the organization itself, for the agency's own papers (a GST certificate, a PAN card, a
// cancelled cheque), with settings:manage; business modules add their records with their own permissions. Changes
// read the session afresh, as the profile's do: the papers can hold bank details.
import {
  attachmentRefInput,
  attachmentSummary,
  downloadLink,
  presignedUpload,
  requestUploadInput,
} from "@travel-crm/contracts/files";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/**
 * The member's own organization record, and no other: another record type, or another organization's id, is "not
 * found", as a file of another record is (ADR 0011). The files module then checks the file belongs to it.
 */
function assertOwnOrganization(member: MemberAccess, record: { recordType: string; recordId: string }): void {
  if (record.recordType !== "organization" || record.recordId !== member.organizationId) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such record");
  }
}

/** A record named without one of its files. */
const recordInput = attachmentRefInput.omit({ attachmentId: true });

const papersViewer = orgProcedure.requires("settings:manage");
const papersEditor = freshProcedure.requires("settings:manage");

export const attachmentsRouter = router({
  /**
   * The record's ready files, oldest first by arrival; a sensitive file's name only for documents:view_sensitive. It
   * is how the Owner finds the papers to take away, so it is an export, as their download links are (ADR 0021).
   */
  list: papersViewer
    .meta({ lifecycle: "export" })
    .input(recordInput)
    .output(z.array(attachmentSummary))
    .query(({ ctx, input }) => {
      assertOwnOrganization(ctx.member, input);
      return ctx.files.list(ctx.member, input);
    }),

  /** Records a pending file and says where the browser PUTs it, for 10 minutes. Refused past the storage limit. */
  requestUpload: papersEditor
    .input(requestUploadInput)
    .output(z.object({ attachment: attachmentSummary, upload: presignedUpload }))
    .mutation(async ({ ctx, input }) => {
      assertOwnOrganization(ctx.member, input);
      const { attachment, upload } = await ctx.files.requestUpload(ctx.member, input);
      return { attachment, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
    }),

  /** Marks the upload ready once storage holds it; harmless to repeat, as after a retried PUT answered 412. */
  confirmUpload: papersEditor
    .input(attachmentRefInput)
    .output(attachmentSummary)
    .mutation(({ ctx, input }) => {
      assertOwnOrganization(ctx.member, input);
      return ctx.files.confirmUpload(ctx.member, input);
    }),

  /**
   * A 5-minute link that downloads the file. A mutation, so no link is cached or saved on the device; an export, so a
   * read-only organization (and a suspended one's Owner) can still take its papers away (ADR 0021).
   */
  downloadLink: papersEditor
    .meta({ lifecycle: "export" })
    .input(attachmentRefInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      assertOwnOrganization(ctx.member, input);
      const link = await ctx.files.downloadLink(ctx.member, input);
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),

  /** Hides the file (a soft delete); its bytes stay in storage, and count, until the platform's purge. */
  remove: papersEditor.input(attachmentRefInput).mutation(async ({ ctx, input }) => {
    assertOwnOrganization(ctx.member, input);
    await ctx.files.remove(ctx.member, input);
  }),
});
