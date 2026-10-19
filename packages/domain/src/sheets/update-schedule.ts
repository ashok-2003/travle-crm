// sheets.update-schedule (spec 5, 7): on sheet.schedule-changed, a connection that is running, has lost access, has no
// tab, lacks columns or needs a manager has a row in the check schedule (due now when it has none); one that is
// connecting, paused or disconnected has none. Run twice it is the same, and a stale row is harmless: the check
// re-reads the connection and does nothing.
import { sheetScheduleChangedEvent, type SheetStatus } from "@travel-crm/contracts/sheets";
import type { Database } from "@travel-crm/db";
import { defineListener, type EventListener } from "../jobs/index.js";
import { sheetOf } from "./connection-row.js";
import { removeScheduleRow, upsertScheduleRow } from "./schedule.js";

const scheduled: ReadonlySet<SheetStatus> = new Set([
  "running",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);

/** Whether a sheet in this status has a schedule row. */
export const hasScheduleRow = (status: SheetStatus): boolean => scheduled.has(status);

export function scheduleListener(dependencies: { db: Database }): EventListener {
  return defineListener({
    name: "sheets.update-schedule",
    eventType: "sheet.schedule-changed",
    payload: sheetScheduleChangedEvent,
    handle: async (event, context) => {
      const sheet = await context.forOrg((tx) => sheetOf(tx, event.payload.sheetId));
      if (sheet === null || !hasScheduleRow(sheet.status)) {
        await removeScheduleRow(dependencies.db, event.payload.sheetId);
        return;
      }
      await upsertScheduleRow(dependencies.db, {
        sheetId: sheet.id,
        organizationId: sheet.organizationId,
        serviceAccountIndex: sheet.serviceAccountIndex,
        nextCheckAt: new Date(),
      });
    },
  });
}
