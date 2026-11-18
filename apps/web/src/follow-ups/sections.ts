// How the Follow-ups screen groups its rows: Overdue and Due today under Due; Tomorrow, This week and Later under Later,
// in the agency's days, customers who replied first (they are waiting on us), then by due time.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { replied } from "./next-move";

export type FollowUpGroup = "overdue" | "dueToday" | "tomorrow" | "thisWeek" | "later";

const groupsOf = { due: ["overdue", "dueToday"], upcoming: ["tomorrow", "thisWeek", "later"] } as const;

function groupOf(row: FollowUpRow, now: Date, timeZone: string): FollowUpGroup {
  const due = new Date(row.dueAt);
  const today = calendarDateIn(now, timeZone);
  const day = calendarDateIn(due, timeZone);
  if (day <= today) return due < now ? "overdue" : "dueToday";
  if (day === addDays(today, 1)) return "tomorrow";
  return day <= addDays(today, 6) ? "thisWeek" : "later";
}

/** The rows of one tab as its non-empty groups, in order. */
export function followUpSections(
  view: "due" | "upcoming",
  rows: readonly FollowUpRow[],
  now: Date,
  timeZone: string,
): { group: FollowUpGroup; rows: FollowUpRow[] }[] {
  const ordered = [...rows].sort(
    (a, b) => Number(replied(b)) - Number(replied(a)) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
  return groupsOf[view]
    .map((group) => ({ group, rows: ordered.filter((row) => groupOf(row, now, timeZone) === group) }))
    .filter((section) => section.rows.length > 0);
}
