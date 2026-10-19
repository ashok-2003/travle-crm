// The lead export's procedures (spec 6.5), served at leadExports.*: asking for the Leads list as a file, following it,
// and downloading it. All are exports (ADR 0021), so a read-only agency, and a suspended one's Owner, still take their
// leads out. An export is its requester's alone: another person's, or a staff export, is not found.
import {
  leadExportDetail,
  leadExportFilter,
  leadExportNames,
  leadExportNamesInput,
  startLeadExportInput,
} from "@travel-crm/contracts/crm";
import { exportIdInput, startedExport } from "@travel-crm/contracts/exports";
import { downloadLink } from "@travel-crm/contracts/files";
import { destinationNames } from "@travel-crm/domain/catalog";
import { exportDetail, exportDownloadLink, startExport } from "@travel-crm/domain/exports";
import { z } from "zod";
import { memberNames } from "../member-names.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** The filter as JSON, which the export keeps as received. */
const storedFilter = z.record(z.string(), z.json());

const exporter = freshProcedure.requires("leads:view").meta({ lifecycle: "export" });
const follower = orgProcedure.requires("leads:view").meta({ lifecycle: "export" });

export const leadExportsRouter = router({
  /** Asks for the list as it is on screen: the filter as sent, kept for the file's job and the export's page. */
  start: exporter
    .input(startLeadExportInput)
    .output(startedExport)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        startExport(
          tx,
          ctx.member,
          "leads",
          { format: input.format, filter: storedFilter.parse(input.filter) },
          new Date(),
        ),
      ),
    ),

  /** The export's state and, for its page, what it holds: the filter with its owner and destination named. */
  get: follower
    .input(exportIdInput)
    .output(leadExportDetail)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const { detail, destinations } = await ctx.db.forOrg(organizationId, async (tx) => {
        const found = await exportDetail(tx, ctx.member, "leads", input.exportId);
        const filter = leadExportFilter.parse(found.filter);
        const names = await destinationNames(tx, filter.destinationId === undefined ? [] : [filter.destinationId]);
        return { detail: { ...found, filter }, destinations: names };
      });
      const { destinationId, ownerUserId } = detail.filter;
      return {
        ...detail,
        people: await memberNames(ctx.identity, organizationId, [ownerUserId]),
        destinationName: destinationId === undefined ? null : (destinations.get(destinationId) ?? null),
      };
    }),

  /** The owner's and the destination's names for the dialog's "What it holds", by id: any destination, not a first page. */
  names: follower
    .input(leadExportNamesInput)
    .output(leadExportNames)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const destinations = await ctx.db.forOrg(organizationId, (tx) =>
        destinationNames(tx, input.destinationId === undefined ? [] : [input.destinationId]),
      );
      return {
        people: await memberNames(ctx.identity, organizationId, [input.ownerUserId]),
        destinationName: input.destinationId === undefined ? null : (destinations.get(input.destinationId) ?? null),
      };
    }),

  /** A 5-minute link to the file, by its requester only, while it is kept (B42). A mutation: no link is cached. */
  downloadLink: exporter
    .input(exportIdInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const link = await exportDownloadLink(ctx.db, ctx.files, ctx.member, "leads", input.exportId, new Date());
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),
});
