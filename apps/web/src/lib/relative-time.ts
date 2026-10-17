// Time relative to now, for the lists' "12 min ago" and "Follow up tomorrow": how long ago something happened, and
// which day an instant falls on as the agency's clocks see it (spec 9.6), never the device's.
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long ago `since` was: minutes under an hour (at least one), hours under a day, then days. */
export function elapsed(since: Date, now: Date): { unit: "minute" | "hour" | "day"; count: number } {
  const gone = Math.max(0, now.getTime() - since.getTime());
  if (gone < HOUR_MS) return { unit: "minute", count: Math.max(1, Math.floor(gone / MINUTE_MS)) };
  if (gone < DAY_MS) return { unit: "hour", count: Math.floor(gone / HOUR_MS) };
  return { unit: "day", count: Math.floor(gone / DAY_MS) };
}

export type DayRelation = "earlier" | "yesterday" | "today" | "tomorrow" | "later";

/** The day `instant` falls on, against today, both as clocks in `timeZone` show them. */
export function dayRelation(instant: Date, { timeZone, now }: { timeZone: string; now: Date }): DayRelation {
  const day = calendarDateIn(instant, timeZone);
  const today = calendarDateIn(now, timeZone);
  if (day === today) return "today";
  if (day === addDays(today, -1)) return "yesterday";
  if (day === addDays(today, 1)) return "tomorrow";
  return day < today ? "earlier" : "later";
}
