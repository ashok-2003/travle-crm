// The quotes export's procedures (bookings revamp, 2026-11-27), served at quoteExports.*: asking for the Quotes list
// as a file, following it, and downloading it, as the leads export does. All are exports (ADR 0021), so a read-only
// agency, and a suspended one's Owner, still take their quotes out; asking and downloading read the session afresh. An
// export is its requester's alone: another person's, or another kind's, is not found.
import { quoteExportDetail, quoteExportFilter, startQuoteExportInput } from "@travel-crm/contracts/quotes";
import { exportIdInput, startedExport } from "@travel-crm/contracts/exports";
import { downloadLink } from "@travel-crm/contracts/files";
import { exportDetail, exportDownloadLink, startExport } from "@travel-crm/domain/exports";
import { z } from "zod";
import { memberNames } from "../member-names.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** The filter as JSON, which the export keeps as received. */
const storedFilter = z.record(z.string(), z.json());

const exporter = freshProcedure.requires("quotes:view").meta({ lifecycle: "export" });
const follower = orgProcedure.requires("quotes:view").meta({ lifecycle: "export" });

export const quoteExportsRouter = router({
  /** Asks for the list as it is on screen: the filter as sent, kept for the file's job and the export's page. */
  start: exporter
    .input(startQuoteExportInput)
    .output(startedExport)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        startExport(
          tx,
          ctx.member,
          "quotes",
          { format: input.format, filter: storedFilter.parse(input.filter) },
          new Date(),
        ),
      ),
    ),

  /** The export's state and, for its page, what it holds: the filter, with its salesperson named. */
  get: follower
    .input(exportIdInput)
    .output(quoteExportDetail)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const found = await ctx.db.forOrg(organizationId, (tx) => exportDetail(tx, ctx.member, "quotes", input.exportId));
      const filter = quoteExportFilter.parse(found.filter);
      const { ownerUserId } = filter;
      const names = await memberNames(ctx.identity, organizationId, [ownerUserId]);
      return { ...found, filter, salespersonName: ownerUserId === undefined ? null : (names[ownerUserId] ?? null) };
    }),

  /** A 5-minute link to the file, by its requester only, while it is kept (B42). A mutation: no link is cached. */
  downloadLink: exporter
    .input(exportIdInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const link = await exportDownloadLink(ctx.db, ctx.files, ctx.member, "quotes", input.exportId, new Date());
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),
});
