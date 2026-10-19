// leadSheets.*: the Google Sheets sync's procedures (spec 6.5, ADR 0031), on the crm plan module. Connecting, the steps, Sync
// now and watching need both leads:create and leads:assign: a sheet decides owners for leads that may not be the
// connector's. What decides where customers' data comes in (confirm, take over, resume) reads the session afresh, and
// pause, resume and disconnect only reduce what happens, so they are open in every lifecycle state (S44). A sheet is named by
// its id; another agency's, or a disconnected one, is not found. Only `begin` takes the pasted link.
import {
  beginSheetInput,
  chooseExistingInput,
  chooseSheetTabInput,
  hideProblemInput,
  matchSheetColumnsInput,
  parseSheetLink,
  recheckSheetInput,
  sheetColumnsView,
  sheetDetail,
  sheetIdInput,
  sheetList,
  sheetProblemsInput,
  sheetProblemsPage,
  verifySheetInput,
} from "@travel-crm/contracts/sheets";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  beginSheet,
  chooseExistingRows,
  chooseSheetTab,
  confirmSheet,
  disconnectSheet,
  hideProblem,
  listSheets,
  matchSheetColumns,
  pauseSheet,
  recheckSheet,
  requestSyncNow,
  resumeSheet,
  sheetDetailOf,
  sheetLimitFor,
  sheetProblems,
  takeOverSheet,
  verifySheet,
} from "@travel-crm/domain/sheets";
import { isOnDemoPlan } from "@travel-crm/domain/subscriptions";
import { z } from "zod";
import { leadWorkerIds } from "../lead-workers.js";
import { memberNames } from "../member-names.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = orgProcedure.requires("leads:create", "leads:assign");
const freshManager = freshProcedure.requires("leads:create", "leads:assign");

const started = z.object({ sheetId: z.string() });

export const leadSheetsRouter = router({
  /** The agency's sheets, the limit, the addresses to share a sheet with, and whether Google is set up here (S9, S24). */
  list: manager.output(sheetList).query(async ({ ctx }) => {
    const { organizationId } = ctx.member;
    const { items, limit, demo } = await ctx.db.forOrg(organizationId, async (tx) => ({
      items: await listSheets(tx),
      limit: await sheetLimitFor(organizationId),
      demo: await isOnDemoPlan(tx, organizationId),
    }));
    return {
      items,
      limit,
      serviceAccountEmails: ctx.google?.accounts().map((account) => account.email) ?? [],
      configured: ctx.google !== null && ctx.sheetsHashes !== null && !demo,
      demo,
    };
  }),

  /** One sheet's page, from its counters: the poll the page makes every two seconds while a check runs. */
  get: manager
    .input(sheetIdInput)
    .output(sheetDetail)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const connection = await ctx.db.forOrg(organizationId, (tx) =>
        tx.sheetConnection.findFirst({
          where: { id: input.sheetId, status: { not: "disconnected" } },
          select: { connectedBy: true, serviceAccountIndex: true },
        }),
      );
      if (connection === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
      const owner = await ctx.identity.firstOwner(organizationId);
      const names = await memberNames(ctx.identity, organizationId, [connection.connectedBy, owner]);
      return ctx.db.forOrg(organizationId, (tx) =>
        sheetDetailOf(tx, input.sheetId, new Date(), {
          serviceAccountEmail: ctx.google?.accounts()[connection.serviceAccountIndex]?.email ?? "",
          connectedByName: names[connection.connectedBy] ?? null,
          defaultOwnerName: owner === null ? null : (names[owner] ?? null),
          readOnly: ctx.entitlements?.access !== "full",
        }),
      );
    }),

  /** The rows that couldn't be added, fifty at a time (S27). */
  problems: manager
    .input(sheetProblemsInput)
    .output(sheetProblemsPage)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => sheetProblems(tx, input))),

  /** Step 1, "Check the sheet": reads the pasted link, opens the sheet once, and makes the draft (S5). */
  begin: manager
    .input(beginSheetInput)
    .output(started)
    .mutation(async ({ ctx, input }) => {
      const link = parseSheetLink(input.link);
      if (link === null)
        throw new DomainError("VALIDATION", "SHEET_LINK_INVALID", "That is not a link to a Google Sheet");
      return beginSheet(ctx.db, { google: ctx.google, hashes: ctx.sheetsHashes }, ctx.member, link, new Date());
    }),

  /** Step 2's columns, samples and guesses, and an Owner column's values: one read of Google (S13). */
  verify: manager
    .input(verifySheetInput)
    .output(sheetColumnsView)
    .mutation(({ ctx, input }) =>
      verifySheet(
        ctx.db,
        { google: ctx.google, hashes: ctx.sheetsHashes },
        ctx.identity,
        ctx.member,
        input,
        new Date(),
      ),
    ),

  chooseTab: manager
    .input(chooseSheetTabInput)
    .mutation(({ ctx, input }) =>
      chooseSheetTab(ctx.db, { google: ctx.google, hashes: ctx.sheetsHashes }, ctx.member, input, new Date()),
    ),

  /** Step 2's Next: the columns' fields and the Owner values matched by hand. */
  match: manager.input(matchSheetColumnsInput).mutation(async ({ ctx, input }) => {
    const owners = await leadWorkerIds(ctx.identity, ctx.member.organizationId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      matchSheetColumns(tx, ctx.member, input, { owners, now: new Date() }),
    );
  }),

  chooseExisting: manager
    .input(chooseExistingInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => chooseExistingRows(tx, input, new Date())),
    ),

  /** Connect the sheet: asks the worker to read its rows (S14). From the last step only; a second press is SHEET_NOT_READY. */
  confirm: freshManager
    .input(sheetIdInput)
    .mutation(({ ctx, input }) => confirmSheet(ctx.db, ctx.member, input.sheetId, new Date())),

  /** Sync now: a full read at once; SHEET_BUSY within 30 seconds of the last check or while one runs (S38). */
  syncNow: manager
    .input(sheetIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => requestSyncNow(tx, input.sheetId, new Date())),
    ),

  /** Check again, for Lost access or Tab missing, on another tab if asked (S39, S40). */
  recheck: manager
    .input(recheckSheetInput)
    .mutation(({ ctx, input }) =>
      recheckSheet(ctx.db, { google: ctx.google, hashes: ctx.sheetsHashes }, ctx.member, input, new Date()),
    ),

  hideProblem: manager
    .input(hideProblemInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => hideProblem(tx, ctx.member, input, new Date())),
    ),

  /** Take over a sheet whose connector can't manage lead sources any more (S34). */
  takeOver: freshManager
    .input(sheetIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => takeOverSheet(tx, ctx.member, input.sheetId)),
    ),

  resume: freshManager
    .meta({ lifecycle: "always" })
    .input(sheetIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => resumeSheet(tx, ctx.member, input.sheetId)),
    ),

  pause: freshManager
    .meta({ lifecycle: "always" })
    .input(sheetIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => pauseSheet(tx, ctx.member, input.sheetId)),
    ),

  disconnect: freshManager
    .meta({ lifecycle: "always" })
    .input(sheetIdInput)
    .mutation(({ ctx, input }) => disconnectSheet(ctx.db, ctx.member, input.sheetId, new Date())),
});
