// Money, counts and dates the Indian way (spec 9.6, DESIGN.md section 9), built on the kernel's formatting so the app,
// the PDFs and the emails agree: ₹12,50,000, 1,23,456, "Fri", "16 Oct" in the organization's time zone.
import { formatDateTime, formatIndianNumber, formatMoney, yearIn, type Money } from "@travel-crm/domain/kernel";

/** "₹12,50,000", "₹1,250.50", "-₹4,500". Paise only when there are some, unless always is asked for (invoices). */
export function formatRupees(amount: Money, { paise = "when-not-zero" }: { paise?: "always" | "when-not-zero" } = {}) {
  const text = formatMoney(amount);
  return paise === "always" ? text : text.replace(/\.00$/, "");
}

/** "1,23,456". */
export function formatCount(value: number): string {
  return formatIndianNumber(value);
}

const dayMonthFormatters = new Map<string, Intl.DateTimeFormat>();

/** "16 Oct" in the current year, "16 Oct 2027" in any other, both as the organization's clocks show the day. */
export function formatDay(instant: Date, { timeZone, now = new Date() }: { timeZone: string; now?: Date }): string {
  if (yearIn(instant, timeZone) !== yearIn(now, timeZone)) {
    return formatDateTime(instant, { timeZone, style: "date" });
  }
  let formatter = dayMonthFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone });
    dayMonthFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/** "Fri", the day of the week as the organization's clocks show it ("Fri 16 Oct" with formatDay). */
export function formatWeekday(instant: Date, { timeZone }: { timeZone: string }): string {
  let formatter = weekdayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone });
    weekdayFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

/** "4:30 pm" in the organization's zone. */
export function formatTime(instant: Date, { timeZone }: { timeZone: string }): string {
  return formatDateTime(instant, { timeZone, style: "time" });
}

/** "16 Oct, 4:30 pm" (with the year when it isn't this one), both as the zone's clocks show them. */
export function formatDayTime(instant: Date, options: { timeZone: string; now?: Date }): string {
  return `${formatDay(instant, options)}, ${formatTime(instant, options)}`;
}

/** A stored number (E.164): an Indian one as "+91 98765 43210", any other as stored, which is unambiguous already. */
export function formatPhoneNumber(e164: string): string {
  return e164.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
}
