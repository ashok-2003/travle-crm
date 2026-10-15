// Permanent deletion from the console (spec 5): exports, then a purge of a whole organization or the erasure of one
// person or record, each a job the console runs. An organization's export is a job too, kept 7 days, downloaded
// through short-lived links. Super admins only.
import {
  exportIdInput,
  exportOrganizationInput,
  exportSubjectInput,
  organizationExport,
  organizationExportDownload,
  queuedJob,
  requestErasureInput,
  requestPurgeInput,
  subjectExport,
} from "@travel-crm/contracts/platform";
import {
  downloadOrganizationExport,
  exportSubject,
  listOrganizationExports,
  requestErasure,
  requestOrganizationExport,
  requestPurge,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dataProtectionRouter = platformT.router({
  /** Asks for an export of everything the organization keeps; a purge needs one done in the last day. */
  exportOrganization: superAdminProcedure
    .input(exportOrganizationInput)
    .output(organizationExport)
    .mutation(({ ctx, input }) => requestOrganizationExport(ctx.services, ctx.staff, input.organizationId)),
  /** The organization's exports, newest first: requested, done, failed or expired. */
  exports: superAdminProcedure
    .input(exportOrganizationInput)
    .output(z.array(organizationExport))
    .query(({ ctx, input }) => listOrganizationExports(ctx.services, input.organizationId)),
  /** Links to a done export, for about 15 minutes. A mutation: each download is logged. */
  downloadExport: superAdminProcedure
    .input(exportIdInput)
    .output(organizationExportDownload)
    .mutation(({ ctx, input }) => downloadOrganizationExport(ctx.services, ctx.staff, input.exportId)),
  requestPurge: superAdminProcedure
    .input(requestPurgeInput)
    .output(queuedJob)
    .mutation(({ ctx, input }) => requestPurge(ctx.services, ctx.staff, input)),
  exportSubject: superAdminProcedure
    .input(exportSubjectInput)
    .output(subjectExport)
    .mutation(({ ctx, input }) => exportSubject(ctx.services, ctx.staff, input)),
  requestErasure: superAdminProcedure
    .input(requestErasureInput)
    .output(queuedJob)
    .mutation(({ ctx, input }) => requestErasure(ctx.services, ctx.staff, input)),
});
