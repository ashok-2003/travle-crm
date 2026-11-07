// A calendar day as a customer reads it in a message: "Sat 14 Nov", with the year when it isn't this year's.
import type { CalendarDate } from "./time.js";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatShortDay(day: CalendarDate, today: CalendarDate): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()] ?? "";
  const words = `${weekday} ${String(date)} ${months[month - 1] ?? ""}`;
  return year === Number(today.slice(0, 4)) ? words : `${words} ${String(year)}`;
}
