// Dates, weekdays and months as an agency's message prints them ("18 Dec", "18th December 2026", "Dec 18", "18/12",
// "18-24 Dec", "har Friday", "shukravar"), read by code: the AI copies a date as printed, and code finds the day it
// means and checks the lines it cites print it.
import { isCalendarDate } from "@travel-crm/contracts/kernel";
import { addDays, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";

export interface PrintedDate {
  day: number;
  month: number;
  /** Only when printed. */
  year: number | null;
}

const MONTH_STARTS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
/** 1 to 12 for a month's name or its short form. */
const monthOf = (word: string | undefined) => MONTH_STARTS.indexOf((word ?? "").slice(0, 3).toLowerCase()) + 1;
const ORDINAL = "(?:st|nd|rd|th)?";
const YEAR = `(?:[\\s,'’-]+(20\\d{2})(?!\\d))?`;

/** "18 Dec", "18th of December 2026", "18-24 Dec" (both days), "Dec 18", "18/12", "18-12-2026", "18.12.2026". */
const PATTERNS: { pattern: RegExp; read: (match: RegExpMatchArray) => PrintedDate[] }[] = [
  {
    pattern: new RegExp(
      `\\b(\\d{1,2})${ORDINAL}\\s*(?:-|–|to|till|se)\\s*(\\d{1,2})${ORDINAL}\\s*(?:of\\s+)?(${MONTH})\\b\\.?${YEAR}`,
      "gi",
    ),
    read: (match) => {
      const month = monthOf(match[3]);
      const year = match[4] === undefined ? null : Number(match[4]);
      return [
        { day: Number(match[1]), month, year },
        { day: Number(match[2]), month, year },
      ];
    },
  },
  {
    pattern: new RegExp(`\\b(\\d{1,2})${ORDINAL}[\\s-]*(?:of\\s+)?(${MONTH})\\b\\.?${YEAR}`, "gi"),
    read: (match) => [
      {
        day: Number(match[1]),
        month: monthOf(match[2]),
        year: match[3] === undefined ? null : Number(match[3]),
      },
    ],
  },
  {
    pattern: new RegExp(`\\b(${MONTH})\\.?\\s*(\\d{1,2})${ORDINAL}(?!\\d)${YEAR}`, "gi"),
    read: (match) => [
      {
        day: Number(match[2]),
        month: monthOf(match[1]),
        year: match[3] === undefined ? null : Number(match[3]),
      },
    ],
  },
  {
    // A dot only with a year, so a price like "4.5" is never a date.
    pattern: /(?<![\d.,])(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?|\.(\d{1,2})\.(\d{4}|\d{2}))(?![\d,]|\.\d)/g,
    read: (match) => {
      const year = match[3] ?? match[5];
      return [
        {
          day: Number(match[1]),
          month: Number(match[2] ?? match[4]),
          year: year === undefined ? null : Number(year.length === 2 ? `20${year}` : year),
        },
      ];
    },
  },
];

const real = (date: PrintedDate) =>
  date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31 && (date.year === null || date.year >= 2000);

/** Every date a text prints. */
export function datesIn(text: string): PrintedDate[] {
  return PATTERNS.flatMap(({ pattern, read }) => [...text.matchAll(pattern)].flatMap(read)).filter(real);
}

/** One date as the AI copied it; null when it is not exactly one date. */
export function printedDate(printed: string): PrintedDate | null {
  const found = datesIn(printed);
  const [first] = found;
  return first !== undefined && found.every((one) => sameDay(one, first)) ? first : null;
}

const sameDay = (first: PrintedDate, second: PrintedDate) =>
  first.day === second.day &&
  first.month === second.month &&
  (first.year === null || second.year === null || first.year === second.year);

/** Whether one of the texts prints this date (a year is compared only when both print one). */
export const dateInTexts = (date: PrintedDate, texts: readonly string[]): boolean =>
  texts.some((text) => datesIn(text).some((found) => sameDay(found, date)));

/** Whether one of the texts prints this calendar day ("2026-12-04" as "4 Dec", "04/12"...). */
export const dayInTexts = (day: string, texts: readonly string[]): boolean =>
  dateInTexts({ day: Number(day.slice(8, 10)), month: Number(day.slice(5, 7)), year: Number(day.slice(0, 4)) }, texts);

const pad = (number: number) => String(number).padStart(2, "0");
const dayOn = (year: number, date: PrintedDate) => `${String(year)}-${pad(date.month)}-${pad(date.day)}`;

/**
 * The calendar day a printed date means: its own year when printed, else the first one on or after `notBefore`
 * (a start date a month back is still this year's, so a date just gone reads as past, not as next year's).
 */
export function dayOf(date: PrintedDate, notBefore: CalendarDate): CalendarDate | null {
  if (date.year !== null) {
    const text = dayOn(date.year, date);
    return isCalendarDate(text) ? parseCalendarDate(text) : null;
  }
  const first = Number(notBefore.slice(0, 4));
  for (const year of [first, first + 1, first + 2]) {
    const text = dayOn(year, date);
    if (isCalendarDate(text) && text >= notBefore) return parseCalendarDate(text);
  }
  return null;
}

/** How far back a start date without a year may be and still be this year's. */
export const startLooksBack = (today: CalendarDate) => addDays(today, -31);

const WEEKDAYS: [RegExp, number][] = [
  [/\b(?:sundays?|sun|ravivar|itwar)\b/i, 0],
  [/\b(?:mondays?|mon|somvar)\b/i, 1],
  [/\b(?:tuesdays?|tues?|mangalvar)\b/i, 2],
  [/\b(?:wednesdays?|wed|budhvar)\b/i, 3],
  [/\b(?:thursdays?|thurs?|guruvar|brihaspativar)\b/i, 4],
  [/\b(?:fridays?|fri|shukravar)\b/i, 5],
  [/\b(?:saturdays?|sat|shanivar)\b/i, 6],
];

/** The weekdays a text names, 0 Sunday to 6 Saturday. */
export function weekdaysIn(text: string): Set<number> {
  return new Set(WEEKDAYS.flatMap(([pattern, day]) => (pattern.test(text) ? [day] : [])));
}

/** The months a text names, 1 to 12. */
export function monthsIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(new RegExp(`\\b(${MONTH})\\b`, "gi"))) {
    found.add(monthOf(match[1]));
  }
  return found;
}
