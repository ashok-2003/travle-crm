// A calendar day (YYYY-MM-DD: a day in the organization's zone, never an instant) as Indian screens write it: "16 Oct"
// in the current year, "16 Oct 2027" in another (DESIGN.md section 9).
import { formatDay } from "@/lib/format";

export function formatCalendarDay(date: string, now: Date = new Date()): string {
  // The day as UTC midnight, shown in UTC, so no zone can move it to the day before or after.
  return formatDay(new Date(`${date}T00:00:00Z`), { timeZone: "UTC", now });
}
