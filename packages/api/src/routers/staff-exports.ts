// The staff export's procedures (spec 6.5), served at staffExports.*: on a fresh session with staff:manage, as exports
// (ADR 0021), so a read-only agency, and a suspended one's Owner, can still take their staff list away. An export is
// its requester's alone: another person's, kind's or organization's is not found.
import { exportDetail, exportIdInput, startedExport, startStaffExportInput } from "@travel-crm/contracts/exports";
import { downloadLink } from "@travel-crm/contracts/files";
import { exportDetail as exportPage, exportDownloadLink, startExport } from "@travel-crm/domain/exports";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const exporter = freshProcedure.requires("staff:manage").meta({ lifecycle: "export" });

export const staffExportsRouter = router({
  /** Asks for the file: the active staff, in the format chosen. The worker makes it. */
  start: exporter
    .input(startStaffExportInput)
    .output(startedExport)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        startExport(tx, ctx.member, "staff", { format: input.format, filter: {} }, new Date()),
      ),
    ),

  /** The export's page: how far it is, and its file while it is kept. */
  get: exporter
    .input(exportIdInput)
    .output(exportDetail)
    // The output schema leaves out the stored filter, which a staff export has none of anyway.
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => exportPage(tx, ctx.member, "staff", input.exportId)),
    ),

  /** A 5-minute link that downloads the file. A mutation, so no link is cached or saved on the device. */
  downloadLink: exporter
    .input(exportIdInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const link = await exportDownloadLink(ctx.db, ctx.files, ctx.member, "staff", input.exportId, new Date());
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),
});
