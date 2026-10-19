// leadImports.*: the lead import's procedures (spec 6.5), on the crm plan module. Whoever imports holds both
// leads:create and leads:assign. An import is its starter's alone (D6): another person's, another kind's or another
// organization's is not found. The steps are changes; Add and the report's download read the session afresh, and the
// download is an export, so a read-only agency can still take the report away.
import { decideLeadImportInput, matchLeadColumnsInput } from "@travel-crm/contracts/crm";
import { downloadLink } from "@travel-crm/contracts/files";
import {
  importDetail as importDetailShape,
  importIdInput,
  importRowsInput,
  importRowsPage as importRowsPageShape,
  recentImport,
  startedImport,
  startImportInput,
} from "@travel-crm/contracts/imports";
import {
  cancelImport,
  confirmImportUpload,
  decideLeadImport,
  importDetail,
  importReportLink,
  importRowsPage,
  matchImportColumns,
  recentImports,
  requestImportAdd,
  startImport,
  stopImport,
} from "@travel-crm/domain/imports";
import { z } from "zod";
import { leadWorkerIds } from "../lead-workers.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const importer = orgProcedure.requires("leads:create", "leads:assign");
const freshImporter = freshProcedure.requires("leads:create", "leads:assign");

export const leadImportsRouter = router({
  /** Records the import and says where the browser PUTs the file, for 10 minutes. */
  start: importer
    .input(startImportInput)
    .output(startedImport)
    .mutation(async ({ ctx, input }) => {
      const started = await startImport(ctx.db, ctx.files, ctx.member, "leads", input, new Date());
      return { ...started, upload: { ...started.upload, expiresAt: started.upload.expiresAt.toISOString() } };
    }),

  /** Once storage holds the file the worker reads it; asked again while it reads, nothing happens. */
  confirmUpload: importer
    .input(importIdInput)
    .mutation(({ ctx, input }) =>
      confirmImportUpload(ctx.db, ctx.files, ctx.member, "leads", input.importId, new Date()),
    ),

  /** Step 2: the columns, the Owner and Stage values and the file's defaults; runs the check. */
  match: importer.input(matchLeadColumnsInput).mutation(async ({ ctx, input }) => {
    const owners = await leadWorkerIds(ctx.identity, ctx.member.organizationId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      matchImportColumns(tx, ctx.member, "leads", input, { owners, roleKeys: new Set(), now: new Date() }),
    );
  }),

  /** Whether the add takes blocked contacts' rows, rows already imported and a sheet's rows already in the CRM. */
  decide: importer
    .input(decideLeadImportInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => decideLeadImport(tx, ctx.member, input)),
    ),

  /** Add: from the preview only; a second press answers IMPORT_NOT_READY. */
  add: freshImporter
    .input(importIdInput)
    .mutation(({ ctx, input }) =>
      requestImportAdd(ctx.db, ctx.member, "leads", input.importId, new Date(), ctx.addGuards),
    ),

  /** Stop: the batch under way finishes and the import ends stopped. Again, nothing. */
  stop: importer
    .input(importIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => stopImport(tx, ctx.member, "leads", input.importId)),
    ),

  /** Cancel this import, from a step it waits at. */
  cancel: importer
    .input(importIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        cancelImport(tx, ctx.member, "leads", input.importId, new Date()),
      ),
    ),

  /** The import as its page shows it: status, columns, matches, defaults, counts and progress. */
  get: importer
    .input(importIdInput)
    .output(importDetailShape)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => importDetail(tx, ctx.member, "leads", input.importId)),
    ),

  /** A page of the preview's example rows with one plan, and one reason when asked. */
  rows: importer
    .input(importRowsInput)
    .output(importRowsPageShape)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => importRowsPage(tx, ctx.member, "leads", input)),
    ),

  /** The person's last ten imports, newest first. */
  recent: importer
    .output(z.array(recentImport))
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => recentImports(tx, ctx.member, "leads"))),

  /** A 5-minute link to the report of rows not added; an export, so a read-only agency can still download it. */
  reportLink: freshImporter
    .meta({ lifecycle: "export" })
    .input(importIdInput)
    .output(downloadLink)
    .mutation(async ({ ctx, input }) => {
      const link = await importReportLink(ctx.db, ctx.files, ctx.member, "leads", input.importId);
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    }),
});
