// The console's hourly sweep of the Sheets sync (spec 7, S5, S6, S31): drafts untouched for 24 hours are deleted with what
// they read, problems resolved for seven days are dropped, schedule rows of connections that are no longer checked go,
// and so do claims no live connection holds. Runs in a platform transaction, a page of each at a time.
import type { OrgTx } from "@travel-crm/db";
import { draftKeptHours, unusedClaimKeptHours } from "./limits.js";
import { dropStaleScheduleRows, dropUnusedClaims } from "./schedule.js";

const HOUR_MS = 60 * 60 * 1000;

export interface SheetsSwept {
  draftsDeleted: number;
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
    // Only a sheet that never ran: one that did and waits for a new tab's baseline is a sheet, not a draft (R1).
    where: {
      status: "connecting",
      connectedAt: null,
      touchedAt: { lt: new Date(now.getTime() - draftKeptHours * HOUR_MS) },
    },
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
  return {
    draftsDeleted: ids.length,
    scheduleRowsDropped: await dropStaleScheduleRows(tx),
    claimsDropped: await dropUnusedClaims(tx, new Date(now.getTime() - unusedClaimKeptHours * HOUR_MS)),
  };
}
