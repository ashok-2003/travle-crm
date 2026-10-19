// The staff import's procedures (spec 6.5), served at staffImports.*: every one on a fresh session with staff:manage,
// in the core plan module, so an admin whose sessions were revoked is stopped at once. The steps are changes; the
// import's page, its rows and Recent imports are views. An import is its starter's alone (D6). There is no `decide`
// (a staff preview has no choices, D22) and no Stop (the add is all or nothing, B45).
import {
  addStaffImportInput,
  setStaffPasswordsInput,
  staffImportedPerson,
  staffImportSeats,
} from "@travel-crm/contracts/identity";
import { matchStaffColumnsInput } from "@travel-crm/contracts/identity";
import {
  importDetail,
  importIdInput,
  importRowsInput,
  importRowsPage,
  recentImport,
  startedImport,
  startImportInput,
} from "@travel-crm/contracts/imports";
import {
  cancelImport,
  confirmImportUpload,
  importRowsPage as importRowsOf,
  matchImportColumns,
  recentImports,
  requestStaffImportAdd,
  setStaffImportPasswords,
  staffImportDetail,
  startImport,
} from "@travel-crm/domain/imports";
import { z } from "zod";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const importer = freshProcedure.requires("staff:manage");

/** A staff import's page: any import's, and the seats and the people it added. */
const staffImportPage = importDetail.extend({ seats: staffImportSeats, added: z.array(staffImportedPerson) });

export const staffImportsRouter = router({
  /** Records the import and says where the browser PUTs its file, for 10 minutes. */
  start: importer
    .input(startImportInput)
    .output(startedImport)
    .mutation(async ({ ctx, input }) => {
      const started = await startImport(ctx.db, ctx.files, ctx.member, "staff", input, new Date());
      return { ...started, upload: { ...started.upload, expiresAt: started.upload.expiresAt.toISOString() } };
    }),

  /** Once storage holds the file, the worker reads it; harmless to repeat. */
  confirmUpload: importer.input(importIdInput).mutation(async ({ ctx, input }) => {
    await confirmImportUpload(ctx.db, ctx.files, ctx.member, "staff", input.importId, new Date());
  }),

  /** Which column holds what, the Role values' matches and the file's one role; then the check runs. */
  match: importer.input(matchStaffColumnsInput).mutation(async ({ ctx, input }) => {
    // Identity runs its own transactions, so the agency's roles are read outside the import's.
    const roles = await ctx.identity.roles.list(ctx.member);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      matchImportColumns(
        tx,
        ctx.member,
        "staff",
        {
          importId: input.importId,
          columns: input.columns,
          values: input.values,
          defaults: { roleKey: input.defaults.roleKey },
        },
        { owners: new Set(), roleKeys: new Set(roles.map((role) => role.key)), now: new Date() },
      ),
    );
  }),

  /**
   * The temporary passwords of the rows to add, made in the browser and sent 25 at a time. Only their hashes are kept
   * (B46): the plain passwords are in this request and nowhere else.
   */
  setPasswords: importer.input(setStaffPasswordsInput).mutation(async ({ ctx, input }) => {
    await setStaffImportPasswords(ctx.db, ctx.identity, ctx.member, input);
  }),

  /** Add: from the preview only, within the seats free, once every row to add has its password's hash. */
  add: importer.input(addStaffImportInput).mutation(async ({ ctx, input }) => {
    await requestStaffImportAdd(ctx.db, ctx.identity, ctx.member, input.importId, input.attemptId, new Date());
  }),

  /** Cancel: from a step it waits at, never while it adds. */
  cancel: importer.input(importIdInput).mutation(async ({ ctx, input }) => {
    await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      cancelImport(tx, ctx.member, "staff", input.importId, new Date()),
    );
  }),

  get: importer
    .input(importIdInput)
    .output(staffImportPage)
    .query(({ ctx, input }) => staffImportDetail(ctx.db, ctx.identity, ctx.member, input.importId)),

  /** A page of example rows by plan and reason: the preview's rows not added. */
  rows: importer
    .input(importRowsInput)
    .output(importRowsPage)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => importRowsOf(tx, ctx.member, "staff", input)),
    ),

  /** The person's last ten staff imports. */
  recent: importer
    .output(z.array(recentImport))
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => recentImports(tx, ctx.member, "staff"))),
});
