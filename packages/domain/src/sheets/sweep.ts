// The console's hourly sweep of the Sheets sync (spec 7, S5, S6, S31): drafts untouched for 24 hours are deleted with what
// they read, problems resolved for seven days are dropped, schedule rows of connections that are no longer checked go,
// and so do claims no live connection holds. Runs in a platform transaction, a page of each at a time.
import type { OrgTx } from "@travel-crm/db";
import { draftKeptHours, resolvedProblemKeptDays, unusedClaimKeptHours } from "./limits.js";
import { dropStaleScheduleRows, dropUnusedClaims } from "./schedule.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface SheetsSwept {
  draftsDeleted: number;
  problemsDropped: number;
  scheduleRowsDropped: number;
  claimsDropped: number;
}

/**
 * One page of each kind of thing swept: at most `limit` drafts and `limit` problems. Platform code, so every query names
 * what it deletes. Run again until a page comes back short.
 */
export async function sweepSheets(tx: OrgTx, now: Date, limit: number): Promise<SheetsSwept> {
  // A draft is a connection that never started running, untouched for a day (S6); its columns and rows go first.
  const drafts = await tx.sheetConnection.findMany({
    where: { status: "connecting", touchedAt: { lt: new Date(now.getTime() - draftKeptHours * HOUR_MS) } },
    select: { id: true },
    take: limit,
    orderBy: { id: "asc" },
  });
  const ids = drafts.map((draft) => draft.id);
  if (ids.length > 0) {
    await tx.sheetRow.deleteMany({ where: { connectionId: { in: ids } } });
    await tx.sheetColumn.deleteMany({ where: { connectionId: { in: ids } } });
    await tx.sheetValueMatch.deleteMany({ where: { connectionId: { in: ids } } });
    await tx.sheetConnection.deleteMany({ where: { id: { in: ids } } });
  }
  const problems = await tx.sheetRow.findMany({
    where: { status: "not_added", resolvedAt: { lt: new Date(now.getTime() - resolvedProblemKeptDays * DAY_MS) } },
    select: { id: true },
    take: limit,
    orderBy: { id: "asc" },
  });
  if (problems.length > 0) await tx.sheetRow.deleteMany({ where: { id: { in: problems.map((row) => row.id) } } });
  return {
    draftsDeleted: ids.length,
    problemsDropped: problems.length,
    scheduleRowsDropped: await dropStaleScheduleRows(tx),
    claimsDropped: await dropUnusedClaims(tx, new Date(now.getTime() - unusedClaimKeptHours * HOUR_MS)),
  };
}
