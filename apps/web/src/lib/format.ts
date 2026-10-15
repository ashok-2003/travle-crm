// Money, counts and dates the Indian way (spec 9.6, DESIGN.md section 9), built on the kernel's formatting so the app,
// the PDFs and the emails agree: ₹12,50,000, 1,23,456, "16 Oct" in the organization's time zone.
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

/** "4:30 pm" in the organization's zone. */
export function formatTime(instant: Date, { timeZone }: { timeZone: string }): string {
  return formatDateTime(instant, { timeZone, style: "time" });
}
