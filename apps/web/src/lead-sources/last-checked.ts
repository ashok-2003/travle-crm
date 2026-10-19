// When a sheet was last checked, as the list and the sheet's page say it, in the agency's zone: "10:42" for today,
// "18 Oct, 10:42" for another day.
import { formatDay, formatDayTime, formatTime } from "@/lib/format";

export function lastCheckedText(
  checkedAt: Date,
  { timeZone, now = new Date() }: { timeZone: string; now?: Date },
): string {
  return formatDay(checkedAt, { timeZone, now }) === formatDay(now, { timeZone, now })
    ? formatTime(checkedAt, { timeZone })
    : formatDayTime(checkedAt, { timeZone, now });
}
