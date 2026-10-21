// sheets.update-schedule (spec 5, 7): on sheet.schedule-changed, a connection that is running, has lost access, has no
// tab, lacks columns or needs a manager has a row in the check schedule (due at a random moment within the first interval when it has none); one that is
// connecting, paused or disconnected has none. Run twice it is the same, and a stale row is harmless: the check
// re-reads the connection and does nothing.
import { sheetScheduleChangedEvent, type SheetStatus } from "@travel-crm/contracts/sheets";
import type { Database } from "@travel-crm/db";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { accountIndexOf } from "./account-index.js";
import { type SheetConnectionRow, sheetOf } from "./connection-row.js";
import { firstCheckSeconds } from "./limits.js";
import { removeScheduleRow, upsertScheduleRow } from "./schedule.js";

const scheduled: ReadonlySet<SheetStatus> = new Set([
  "running",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);

/** Its account's place now; where it was kept when the account is no longer there (the start-up check says so loudly). */
function indexIn(google: Pick<GoogleSheets, "accounts"> | null, sheet: SheetConnectionRow): number {
  try {
    return accountIndexOf(google, sheet);
  } catch {
    return sheet.serviceAccountIndex;
  }
}

/** Whether a sheet in this status has a schedule row. */
export const hasScheduleRow = (status: SheetStatus): boolean => scheduled.has(status);

export function scheduleListener(dependencies: {
  db: Database;
  /** The accounts as they are now: a sheet goes to its account by the address it was shared with. */
  google?: Pick<GoogleSheets, "accounts"> | null;
  checkIntervalSeconds?: number;
  random?: () => number;
}): EventListener {
  return defineListener({
    name: "sheets.update-schedule",
    eventType: "sheet.schedule-changed",
    payload: sheetScheduleChangedEvent,
    handle: async (event, context) => {
      const sheet = await context.forOrg((tx) => sheetOf(tx, event.payload.sheetId));
      if (sheet === null || !hasScheduleRow(sheet.status)) {
        await removeScheduleRow(dependencies.db, {
          sheetId: event.payload.sheetId,
          organizationId: event.organizationId,
        });
        return;
      }
      await upsertScheduleRow(dependencies.db, {
        sheetId: sheet.id,
        organizationId: sheet.organizationId,
        serviceAccountIndex: indexIn(dependencies.google ?? null, sheet),
        serviceAccountEmail: sheet.serviceAccountEmail,
        // The first check is at a random moment within the first interval, so connections never all read at once.
        nextCheckAt: new Date(
          Date.now() + firstCheckSeconds(dependencies.checkIntervalSeconds, dependencies.random) * 1000,
        ),
      });
    },
  });
}
