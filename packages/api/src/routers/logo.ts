// organization.logo.*: the organization's logo, an attachment of record type organization_logo whose newest ready
// file is the logo (PNG or JPEG, at most 1 MB), for the branding screen and the issued documents' branding. The file
// goes straight to storage; the api hands out the links and checks what arrived.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import {
  LOGO_RECORD_TYPE,
  logoRefInput,
  logoUpload,
  organizationLogo,
  requestLogoUploadInput,
  type OrganizationLogo,
} from "@travel-crm/contracts/profile";
import type { Files } from "@travel-crm/domain/files";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** The organization's logos are attached to the organization itself. */
const logosOf = (member: MemberAccess) => ({ recordType: LOGO_RECORD_TYPE, recordId: member.organizationId });

/**
 * The organization's logo: the newest of its ready logo files, or undefined. A replaced logo is kept, so a document
 * issued with it a moment before still finds it when the worker renders.
 */
export async function currentLogo(
  files: Pick<Files, "list">,
  member: MemberAccess,
): Promise<AttachmentSummary | undefined> {
  // Oldest first.
  return (await files.list(member, logosOf(member))).at(-1);
}

/** The logo with a short-lived link to show it (5 minutes: the screen asks again when it opens). */
async function shown(files: Files, member: MemberAccess, logo: AttachmentSummary): Promise<OrganizationLogo> {
  const link = await files.downloadLink(member, { ...logosOf(member), attachmentId: logo.id });
  return { attachmentId: logo.id, fileName: logo.fileName, url: link.url, expiresAt: link.expiresAt.toISOString() };
}

export const logoRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(organizationLogo.nullable())
    .query(async ({ ctx }) => {
      const logo = await currentLogo(ctx.files, ctx.member);
      return logo ? shown(ctx.files, ctx.member, logo) : null;
    }),

  /** Where the browser PUTs the logo; it counts toward the organization's storage like any file. */
  requestUpload: freshProcedure
    .requires("settings:manage")
    .input(requestLogoUploadInput)
    .output(logoUpload)
    .mutation(async ({ ctx, input }) => {
      const { attachment, upload } = await ctx.files.requestUpload(ctx.member, {
        ...logosOf(ctx.member),
        ...input,
        sensitive: false,
      });
      return { attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
    }),

  /** Once storage holds the promised file, it is the logo. Harmless to repeat, as after a retried PUT. */
  confirmUpload: freshProcedure
    .requires("settings:manage")
    .input(logoRefInput)
    .output(organizationLogo)
    .mutation(async ({ ctx, input }) => {
      const logo = await ctx.files.confirmUpload(ctx.member, { ...logosOf(ctx.member), ...input });
      return shown(ctx.files, ctx.member, logo);
    }),

  /**
   * Removes the logo and the ones it replaced, so an older logo never comes back in its place. A screen still showing
   * an older logo removes only that one and older: a newer logo, uploaded meanwhile, stays.
   */
  remove: freshProcedure
    .requires("settings:manage")
    .input(logoRefInput)
    .mutation(async ({ ctx, input }) => {
      const logos = await ctx.files.list(ctx.member, logosOf(ctx.member));
      const position = logos.findIndex((logo) => logo.id === input.attachmentId);
      if (position === -1) throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such logo");
      for (const logo of logos.slice(0, position + 1)) {
        await ctx.files.remove(ctx.member, { ...logosOf(ctx.member), attachmentId: logo.id });
      }
    }),
});
