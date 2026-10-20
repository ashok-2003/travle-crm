// How much of the tab a check reads (S18). A normal check reads from the cursor less the lookback (or from the first row
// still waiting, if earlier); Sync now, Check again, the first check after 03:00 each day, a changed header and a sheet
// with fewer rows than the cursor read the whole tab. Every read starts from the stored cursor, never "the last two
// minutes", so a worker that slept an hour misses nothing.
import type { SheetRead } from "@travel-crm/integrations/google-sheets";
import { addDays, calendarDateIn, instantAt, parseTimeOfDay, timeOfDayIn } from "../kernel/index.js";
import type { SheetConnectionRow } from "./connection-row.js";
import { dailyFullReadHour, lookbackRows } from "./limits.js";

export type CheckMode = "scheduled" | "sync-now" | "recheck";

export interface ReadPlan {
  /** The first data row to read: 2 for a full read. */
  fromRow: number;
  full: boolean;
  reason: "sync-now" | "recheck" | "daily" | "window" | "header-changed" | "rows-deleted" | "repeated-row";
}

const dailyReadTime = parseTimeOfDay(`${String(dailyFullReadHour).padStart(2, "0")}:00`);

/**
 * Whether a new local day's full read is due: the first check after 03:00 in the agency's zone since the last full read
 * began. 02:59 is still the day before; once read, the same day asks no more.
 */
export function dailyReadDue(lastFullReadAt: Date | null, now: Date, timeZone: string): boolean {
  if (lastFullReadAt === null) return true;
  const today = calendarDateIn(now, timeZone);
  const boundaryDay = timeOfDayIn(now, timeZone) < dailyReadTime ? addDays(today, -1) : today;
  return lastFullReadAt < instantAt(boundaryDay, dailyReadTime, timeZone);
}

export function decideRead(input: {
  connection: Pick<SheetConnectionRow, "cursorRow" | "lastFullReadAt">;
  mode: CheckMode;
  now: Date;
  timeZone: string;
  /** The smallest row number of a row still waiting (pending), so a half-typed row is never left behind the window. */
  firstPendingRow: number | null;
}): ReadPlan {
  const { connection, mode, now, timeZone, firstPendingRow } = input;
  if (mode !== "scheduled") return { fromRow: 2, full: true, reason: mode };
  if (dailyReadDue(connection.lastFullReadAt, now, timeZone)) return { fromRow: 2, full: true, reason: "daily" };
  const windowStart = connection.cursorRow - lookbackRows;
  const start = firstPendingRow === null ? windowStart : Math.min(windowStart, firstPendingRow);
  return { fromRow: Math.max(2, start), full: false, reason: "window" };
}

/**
 * After a windowed read: another, full, read is needed when the header changed since the last one, or the sheet has
 * fewer rows than the cursor (rows were deleted). A full read already is the whole tab.
 */
export function followUpFullRead(
  connection: Pick<SheetConnectionRow, "cursorRow" | "headerHash">,
  headerHash: Uint8Array,
  read: Pick<SheetRead, "lastRow">,
): "header-changed" | "rows-deleted" | null {
  const { headerHash: stored } = connection;
  if (stored !== null && Buffer.compare(stored, headerHash) !== 0) return "header-changed";
  return read.lastRow < connection.cursorRow ? "rows-deleted" : null;
}
