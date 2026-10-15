// A subscription's days as the organization's calendar shows them (DESIGN.md section 9): "22 Oct" this year, "22 Oct
// 2027" in another. subscription.get's dates are calendar days in the organization's time zone, with no time.
import { parseCalendarDate, startOfDayIn } from "@travel-crm/domain/kernel";
import { formatDay } from "@/lib/format";

/** "22 Oct" in the organization's current year, else "22 Oct 2027". */
export function formatCalendarDate(date: string, { timeZone, now = new Date() }: { timeZone: string; now?: Date }) {
  // The day's first instant in the zone, shown in the same zone, is that day wherever the zone is.
  return formatDay(startOfDayIn(parseCalendarDate(date), timeZone), { timeZone, now });
}
