// Reading one cell of a lead file as a value (spec B14, B20): days always day first, months, rupees with their lakhs
// and crores, adults and children's ages. Each returns null for a value it can't read, which the row then keeps in
// the lead's note (B21) rather than guess. Pure functions of the text.
import { MAX_BUDGET_PAISE } from "@travel-crm/contracts/crm";
import { isCalendarDate } from "@travel-crm/contracts/kernel";
import { parseCalendarDate, type CalendarDate } from "../../kernel/index.js";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** The month (1-12) a name stands for: "Oct", "Sept" or "October", case ignored; null for anything else. */
function monthOfName(word: string): number | null {
  const lower = word.toLowerCase();
  if (lower.length < 3) return null;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(lower));
  return index === -1 ? null : index + 1;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

function dayOf(year: number, month: number, day: number): CalendarDate | null {
  const text = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  return isCalendarDate(text) ? parseCalendarDate(text) : null;
}

export interface DayOptions {
  /** A sheet whose locale writes 10/12/2026 for 12 October: when both parts are 12 or less the day isn't trusted. */
  monthFirstDates?: boolean;
}

/**
 * A day as yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, "16 Oct 2026", "16-Oct-2026" or "Oct 16, 2026": day first
 * and never month first, so 10/12/2026 is 10 December. A bare serial number or a two-digit year is not a day.
 */
export function readDay(text: string, options: DayOptions = {}): CalendarDate | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(value);
  if (numeric) {
    const [first, second, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (options.monthFirstDates === true && first <= 12) {
      // 10/25/2026 can only be month first; 10/12/2026 could be either, so it isn't trusted.
      return second > 12 ? dayOf(year, first, second) : null;
    }
    return dayOf(year, second, first);
  }
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]+([A-Za-z]{3,9})\.?[\s\-/,]+(\d{4})$/.exec(value);
  if (dayFirst) {
    const month = monthOfName(dayFirst[2] ?? "");
    return month === null ? null : dayOf(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }
  const monthFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(value);
  if (monthFirst) {
    const month = monthOfName(monthFirst[1] ?? "");
    return month === null ? null : dayOf(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  return null;
}

export interface DayAndTime {
  day: CalendarDate;
  /** The wall-clock time the cell holds, or null for a date alone. */
  time: { hour: number; minute: number; second: number } | null;
}

const TIME_SUFFIX = /^(.*?)[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?$/i;

/** A day with the time after it when the cell has one: "19/10/2026 14:32:10", "2026-10-19T09:02", "5:30 PM". */
export function readDayAndTime(text: string, options: DayOptions = {}): DayAndTime | null {
  const value = text.trim();
  const suffixed = TIME_SUFFIX.exec(value);
  if (suffixed) {
    const day = readDay(suffixed[1] ?? "", options);
    let hour = Number(suffixed[2]);
    const [minute, second] = [Number(suffixed[3]), Number(suffixed[4] ?? "0")];
    const meridiem = suffixed[5]?.toLowerCase();
    if (meridiem !== undefined) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
    }
    if (day === null || hour > 23 || minute > 59 || second > 59) return null;
    return { day, time: { hour, minute, second } };
  }
  const day = readDay(value, options);
  return day === null ? null : { day, time: null };
}

const FLEXIBLE = /^(flexible|flexi|open|not (fixed|decided|sure|finalised|finalized)( yet)?|undecided|tbd)$/i;

/** A travel month as "2026-12", or the word "flexible" (no month is spelled that): "Dec 2026", "December 2026", "12/2026", "2026-12", "open". */
export function readMonth(text: string): string | null {
  const value = text.trim();
  if (FLEXIBLE.test(value)) return "flexible";
  const monthOf = (year: number, month: number) =>
    month >= 1 && month <= 12 && year >= 1000 ? `${pad(year, 4)}-${pad(month)}` : null;
  const iso = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (iso) return monthOf(Number(iso[1]), Number(iso[2]));
  const numeric = /^(\d{1,2})[/-](\d{4})$/.exec(value);
  if (numeric) return monthOf(Number(numeric[2]), Number(numeric[1]));
  const named = /^([A-Za-z]{3,9})\.?[\s\-,/]*(\d{4})$/.exec(value);
  if (named) {
    const month = monthOfName(named[1] ?? "");
    return month === null ? null : monthOf(Number(named[2]), month);
  }
  return null;
}

const MULTIPLIERS: Readonly<Record<string, bigint>> = {
  k: 1_000n,
  l: 100_000n,
  lac: 100_000n,
  lacs: 100_000n,
  lakh: 100_000n,
  lakhs: 100_000n,
  cr: 10_000_000n,
  crore: 10_000_000n,
  crores: 10_000_000n,
};

/**
 * Rupees as paise: "₹1,50,000", "Rs 150000", "INR 1.5 lakh", "150k", "1.5 L", "2 lac", "1 Cr". Null when it isn't an
 * amount, has a fraction of a paisa, or is outside ₹0.01 to ₹100 crore (the table's bound).
 */
export function readPaise(text: string): number | null {
  const stripped = text
    .trim()
    .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
    .replace(/\s*(?:\/-|only)$/i, "")
    .replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?\s*([a-z]+)?$/i.exec(stripped);
  if (!match) return null;
  const suffix = match[3]?.toLowerCase();
  const multiplier = suffix === undefined ? 1n : MULTIPLIERS[suffix];
  if (multiplier === undefined) return null;
  const fraction = match[2] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const paiseTimesScale = BigInt(`${match[1] ?? "0"}${fraction}`) * multiplier * 100n;
  if (paiseTimesScale % scale !== 0n) return null;
  const paise = paiseTimesScale / scale;
  return paise >= 1n && paise <= BigInt(MAX_BUDGET_PAISE) ? Number(paise) : null;
}

/** Adults, 1-99: "2", or "2 adults". */
export function readAdults(text: string): number | null {
  const match = /^(\d{1,2})(?:\s*(?:adults?|pax|persons?|people))?$/i.exec(text.trim());
  const adults = match === null ? null : Number(match[1]);
  return adults !== null && adults >= 1 ? adults : null;
}

/** Children's ages, 0-17 each and at most 20, from a list like "7, 4", "7 and 4" or "7;4". */
export function readChildrenAges(text: string): number[] | null {
  const parts = text
    .trim()
    .split(/\s*(?:,|;|&|\band\b|\s)\s*/i)
    .filter((part) => part !== "");
  if (parts.length === 0 || parts.length > 20) return null;
  const ages = parts.map((part) => (/^\d{1,2}$/.test(part) ? Number(part) : Number.NaN));
  return ages.every((age) => age >= 0 && age <= 17) ? ages : null;
}

/** A count of children, 0-20, from a whole number. */
export function readChildrenCount(text: string): number | null {
  const count = /^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
  return count >= 0 && count <= 20 ? count : null;
}
