// A calendar day as a customer reads it in a message: "Sat 14 Nov", with the year when it isn't this year's; or, on a
// document, always with its year: "Fri 4 Dec 2026", or "4 Dec 2026" without the weekday.
import type { CalendarDate } from "./time.js";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function partsOf(day: CalendarDate) {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()] ?? "";
  return { year, weekday, words: `${String(date)} ${months[month - 1] ?? ""}` };
}

export function formatShortDay(day: CalendarDate, today: CalendarDate): string {
  const { year, weekday, words } = partsOf(day);
  const short = `${weekday} ${words}`;
  return year === Number(today.slice(0, 4)) ? short : `${short} ${String(year)}`;
}

/** "Fri 4 Dec 2026", or "4 Dec 2026" when `weekday` is false: the year is always there. */
export function formatDayWithYear(day: CalendarDate, options: { weekday: boolean }): string {
  const { year, weekday, words } = partsOf(day);
  return `${options.weekday ? `${weekday} ` : ""}${words} ${String(year)}`;
}
