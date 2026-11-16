// Reads the days a text names with a day of a month ("13 Dec", "Dec 13th", "13/12", "१३ दिसंबर"), for G2 and the trace's
// flags: each the next such day not past, as the fill reads a date.
import { amountsAndDatesIn } from "@travel-crm/contracts/ai";
import { parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { monthOf, resolveDay } from "../../fill/dates.js";
import { HINDI_MONTHS, withAsciiDigits } from "./amounts.js";

const HINDI_DATE = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${HINDI_MONTHS.join("|")})(?![\\p{L}\\p{M}])`, "gu");
const NUMERIC_DATE = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/u;
const DAY_MONTH = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]+)/giu;
const MONTH_DAY = /([a-z]+)\.?\s*(\d{1,2})(?!\d)/giu;

/** "13 Dec", "Dec 13th", "13/12" as day/month[/year], or null for a span with no day of a month ("this Saturday"). */
function dayOfMonth(span: string): string | null {
  const numeric = NUMERIC_DATE.exec(span);
  if (numeric) return [numeric[1], numeric[2], numeric[3]].filter((part) => part !== undefined).join("/");
  for (const m of span.matchAll(DAY_MONTH)) {
    const month = monthOf((m[2] ?? "").toLowerCase());
    if (month !== null) return `${m[1] ?? ""}/${String(month)}`;
  }
  for (const m of span.matchAll(MONTH_DAY)) {
    const month = monthOf((m[1] ?? "").toLowerCase());
    if (month !== null) return `${m[2] ?? ""}/${String(month)}`;
  }
  return null;
}

const hindiMonthOf = (name: string) =>
  HINDI_MONTHS.findIndex((pattern) => new RegExp(`^(?:${pattern})$`, "u").test(name)) + 1;

/** The days the text names with a day of a month, each the next one not past (a day with a past year: none). */
export function datesIn(text: string, today: CalendarDate): CalendarDate[] {
  const digits = withAsciiDigits(text).normalize("NFC");
  const written = [
    ...amountsAndDatesIn(digits).flatMap((span) =>
      span.kind === "date" ? [dayOfMonth(digits.slice(span.start, span.end))] : [],
    ),
    ...[...digits.matchAll(HINDI_DATE)].map((m) => `${m[1] ?? ""}/${String(hindiMonthOf(m[2] ?? ""))}`),
  ];
  const days = written.flatMap((one) => (one === null ? [] : [resolveDay(one, today)]));
  return [...new Set(days.flatMap((one) => (one === null ? [] : [parseCalendarDate(one)])))];
}
