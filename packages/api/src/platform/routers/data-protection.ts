// Permanent deletion from the console (spec 5): exports, then a purge of a whole organization or the erasure of one
// person or record, each a job the console runs. Super admins only.
import {
  exportOrganizationInput,
  exportSubjectInput,
  organizationExport,
  queuedJob,
  requestErasureInput,
  requestPurgeInput,
  subjectExport,
} from "@travel-crm/contracts/platform";
import { exportOrganization, exportSubject, requestErasure, requestPurge } from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dataProtectionRouter = platformT.router({
  /** Everything the organization keeps; a purge needs one from the last day. A mutation: it is logged. */
  exportOrganization: superAdminProcedure
    .input(exportOrganizationInput)
    .output(organizationExport)
    .mutation(({ ctx, input }) => exportOrganization(ctx.services, ctx.staff, input.organizationId)),
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
