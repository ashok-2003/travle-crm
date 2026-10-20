// A check of a connected sheet (spec 7, S17-S32, rulings S2, S9-S12): claim it, read Google outside any transaction, match
// the header, plan the rows, save them fifty at a time, and close. Run for a scheduled tick (a job handler) and for Sync
// now and Check again (a listener); both call this. Idempotent: a row with an outcome is never saved again, so two checks
// at once, or one retried after a crash, add each row once.
import { GoogleSheetsError } from "@travel-crm/integrations/google-sheets";
import { isUniqueViolation } from "@travel-crm/db";
import { sheetSyncRequestedEvent } from "@travel-crm/contracts/sheets";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";
import {
  closeCheck,
  type CheckDependencies,
  type CheckMode,
  type CheckOutcome,
  decideRead,
  enterAttention,
  firstPendingRow,
  followUpFullRead,
  handleReadFailure,
  headerHashOf,
  holdSheet,
  matchHeader,
  numberRows,
  repeatsAboveWindow,
  maxSheetRows,
  readSheetTab,
  recordMissingColumns,
  stopsTheCheck,
  storedColumns,
  type ReadPlan,
  type SheetConnectionRow,
  uuidFromText,
} from "../../sheets/index.js";
import { claimCheck } from "./check-claim.js";
import { planCheck } from "./check-plan.js";
import { noticeSheetOwners, ownersToSummarise } from "./sheet-notices.js";
import {
  recordCouldNotAdd,
  saveSheetBatch,
  type PlannedRow,
  type SavedBatch,
  type SaveBatchContext,
} from "./sheet-save.js";

export type { CheckDependencies as CheckLeadSheetDependencies } from "../../sheets/index.js";

/** A save transaction's own limit, a margin and never the plan: the clock is what keeps it short. */
const SAVE_TIMEOUT = { timeout: 15_000 } as const;
const YIELD_WAIT_SECONDS = 60;

/** One batch, run again once when someone added the same contact meanwhile; a row that fails alone is set aside. */
async function saveBatch(
  dependencies: CheckDependencies,
  context: SaveBatchContext,
  organizationId: string,
  decisions: readonly PlannedRow[],
): Promise<SavedBatch> {
  const { db } = dependencies;
  const run = (limit?: number) =>
    db.forOrg(
      organizationId,
      (tx) => saveSheetBatch(tx, context, decisions, limit === undefined ? {} : { limit, timeBoxMs: 0 }),
      SAVE_TIMEOUT,
    );
  try {
    return await run();
  } catch (first) {
    if (isUniqueViolation(first)) {
      try {
        return await run();
      } catch {
        // Fails again: a row at a time.
      }
    }
  }
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      return await run(1);
    } catch {
      // Once more, then the row is the one that can't be added.
    }
  }
  const [poison] = decisions;
  if (poison === undefined) return { processed: 0, stopped: null, madeFor: new Map() };
  await db.forOrg(organizationId, (tx) => recordCouldNotAdd(tx, context, poison));
  dependencies.log(`sheets: a row of sheet ${context.sheetId} could not be added`);
  return { processed: 1, stopped: null, madeFor: new Map() };
}

/** The read of a check: the window, then a full read when the header changed or rows were deleted (S18). */
async function readForCheck(dependencies: CheckDependencies, sheet: SheetConnectionRow, mode: CheckMode, now: Date) {
  const { db, google } = dependencies;
  if (google === null) throw new GoogleSheetsError("unavailable");
  const { pending, timeZone } = await db.forOrg(sheet.organizationId, async (tx) => ({
    pending: await firstPendingRow(tx, sheet.id),
    timeZone: await organizationTimeZone(tx, sheet.organizationId),
  }));
  let plan: ReadPlan = decideRead({ connection: sheet, mode, now, timeZone, firstPendingRow: pending });
  let { read, tabTitle } = await readSheetTab(google, sheet, plan.fromRow);
  const headerHash = headerHashOf(read.header);
  let follow: ReadPlan["reason"] | null = plan.full ? null : followUpFullRead(sheet, headerHash, read);
  if (follow === null && !plan.full) {
    // A copy of a row met above the window is numbered as the first in it: the whole tab is read, where it is true (SD12).
    const repeats = await db.forOrg(sheet.organizationId, (tx) =>
      repeatsAboveWindow(tx, sheet.id, numberRows(read.rows), plan.fromRow),
    );
    if (repeats) follow = "repeated-row";
  }
  if (follow !== null) {
    plan = { fromRow: 2, full: true, reason: follow };
    ({ read, tabTitle } = await readSheetTab(google, sheet, 2));
  }
  // The sheet's name is a cache a full read refreshes; Google not answering this once is no reason to fail the check.
  const sheetTitle = plan.full
    ? await google
        .describe(sheet.serviceAccountIndex, sheet.spreadsheetId, { tabGid: sheet.tabGid })
        .then((description) => description.title)
        .catch(() => null)
    : null;
  return { read, tabTitle, plan, headerHash: headerHashOf(read.header), sheetTitle };
}

async function runCheck(
  dependencies: CheckDependencies,
  input: { organizationId: string; sheetId: string; mode: CheckMode },
  claim: { sheet: SheetConnectionRow; access: MemberAccess },
  startedAt: Date,
  clock: () => Date,
): Promise<CheckOutcome> {
  const { db, holds, hashes, checkIntervalSeconds } = dependencies;
  const { sheet, access } = claim;
  const { organizationId } = input;
  const done = (result: CheckOutcome["result"], nextCheckInSeconds = checkIntervalSeconds): CheckOutcome => ({
    result,
    nextCheckInSeconds,
    keepSchedule: true,
  });

  const { read, tabTitle, plan, headerHash, sheetTitle } = await readForCheck(
    dependencies,
    sheet,
    input.mode,
    startedAt,
  );
  holds.recovered(sheet.serviceAccountIndex);

  // Columns are found by their header (S11); a gap that leaves no name or no contact stops the check, consuming no row.
  const columns = await db.forOrg(organizationId, (tx) => storedColumns(tx, sheet.id));
  const match = matchHeader(read.header, columns);
  const stop = stopsTheCheck(match, columns);
  await db.forOrg(organizationId, (tx) => recordMissingColumns(tx, sheet.id, columns, match));
  if (stop !== null) {
    await db.forOrg(organizationId, async (tx) => {
      const held = await holdSheet(tx, sheet.id);
      await tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: null } });
      if (held !== null && held.status !== "disconnected") {
        await enterAttention(tx, { sheet: held, state: "columns_missing", now: clock() });
      }
    });
    return done("checked");
  }

  const planned = await planCheck(dependencies, { sheet, access, mode: input.mode, read, plan, match, now: startedAt });
  const summarised = ownersToSummarise(planned.candidates);
  const context: SaveBatchContext = {
    sheetId: sheet.id,
    access,
    hashes,
    workers: planned.workers,
    defaultOwnerUserId: planned.defaultOwnerUserId,
    summarised,
    now: startedAt,
  };
  const madeFor = new Map<string, number>();
  let next = 0;
  let stopped: SavedBatch["stopped"] = null;
  while (next < planned.decisions.length && stopped === null) {
    const saved = await saveBatch(
      dependencies,
      { ...context, now: clock() },
      organizationId,
      planned.decisions.slice(next),
    );
    next += saved.processed;
    stopped = saved.stopped;
    for (const [owner, count] of saved.madeFor) madeFor.set(owner, (madeFor.get(owner) ?? 0) + count);
  }
  if (stopped === "gone") return { result: "skipped", nextCheckInSeconds: checkIntervalSeconds, keepSchedule: false };
  if (stopped === "yielded") {
    // An import is adding: the cursor stays, so the rows not reached are read again, and the check tries again soon.
    await db.forOrg(organizationId, (tx) =>
      tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: null } }),
    );
    return done("yielded", YIELD_WAIT_SECONDS);
  }

  const closedAt = clock();
  await db.forOrg(organizationId, async (tx) => {
    const closed = await closeCheck(tx, sheet.id, {
      now: closedAt,
      cursorRow: Math.min(read.lastRow, maxSheetRows + 1),
      rowsSeen: Math.max(read.lastRow - 1, 0),
      truncated: read.truncated,
      headerHash,
      full: plan.full,
      sheetTitle,
      tabTitle,
      gained: match.unseen.map(({ header, headerKey }) => ({ header, key: headerKey })),
    });
    if (closed) {
      // The connector is the actor: they are never told about their own leads.
      await noticeSheetOwners(tx, access, {
        sheetTitle: sheetTitle ?? sheet.sheetTitle,
        counts: madeFor,
        sourceEventId: uuidFromText(`sheet-check:${sheet.id}:${startedAt.toISOString()}`),
      });
    }
  });
  return done("checked");
}

export async function checkLeadSheet(
  dependencies: CheckDependencies,
  input: { organizationId: string; sheetId: string; mode: CheckMode },
  clock: () => Date = () => new Date(),
): Promise<CheckOutcome> {
  const startedAt = clock();
  const claim = await claimCheck(dependencies, input, startedAt);
  if (claim.kind === "skip") return claim.outcome;
  try {
    return await runCheck(dependencies, input, claim, startedAt, clock);
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      return handleReadFailure(dependencies, claim.sheet, error, input.mode, clock());
    }
    // Let go of the claim so the next check isn't held off for five minutes, and tell the job it failed.
    await dependencies.db
      .forOrg(input.organizationId, (tx) =>
        tx.sheetConnection.updateMany({ where: { id: input.sheetId }, data: { checkStartedAt: null } }),
      )
      .catch(() => undefined);
    throw error;
  }
}

/** crm.check-lead-sheet: Sync now and Check again publish sheet.sync-requested (a rare, user-made event, S2). */
export function checkLeadSheetListener(dependencies: CheckDependencies): EventListener {
  return defineListener({
    name: "crm.check-lead-sheet",
    eventType: "sheet.sync-requested",
    payload: sheetSyncRequestedEvent,
    handle: async (event) => {
      await checkLeadSheet(dependencies, {
        organizationId: event.organizationId,
        sheetId: event.payload.sheetId,
        mode: event.payload.mode,
      });
    },
  });
}
