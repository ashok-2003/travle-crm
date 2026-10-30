// Dates in words, resolved by code (design 2): the model returns what was said ("kal", "next Friday", "15 Dec") and this turns it
// into a day on the organization's calendar from today's date there. A day with no year is the next one that is not past.
// English and Hinglish; what it can't read is null, and the fill asks instead of guessing.

const MONTHS = [
  ["jan", "january", "janvari"],
  ["feb", "february", "farvari"],
  ["mar", "march"],
  ["apr", "april"],
  ["may", "mai"],
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
];
const WEEKDAYS = [
  ["sunday", "sun", "ravivar", "itwar"],
  ["monday", "mon", "somvar"],
  ["tuesday", "tue", "tues", "mangalvar"],
  ["wednesday", "wed", "budhvar"],
  ["thursday", "thu", "thur", "thurs", "guruvar", "brihaspativar"],
  ["friday", "fri", "shukravar"],
  ["saturday", "sat", "shanivar"],
];

const monthOf = (word: string): number | null => {
  const index = MONTHS.findIndex((names) => names.includes(word));
  return index < 0 ? null : index + 1;
};
const weekdayOf = (word: string): number | null => {
  const index = WEEKDAYS.findIndex((names) => names.includes(word));
  return index < 0 ? null : index;
};

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${String(year)}-${pad(month)}-${pad(day)}`;
const parts = (day: string) => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)),
  day: Number(day.slice(8, 10)),
});

/** Whether the day exists (no 30 February). */
function real(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const plusDays = (day: string, count: number): string => {
  const { year, month, day: of } = parts(day);
  const date = new Date(Date.UTC(year, month - 1, of + count));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};
const weekdayOfDay = (day: string): number => {
  const { year, month, day: of } = parts(day);
  return new Date(Date.UTC(year, month - 1, of)).getUTCDay();
};

/** What is said, lower-cased with ordinals, commas and filler taken out. */
function tidy(spoken: string): string {
  return spoken
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,.]/g, " ")
    .replace(/\b(of|on|the|from|till|until|to|ko|tak|se)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The next time a month and a day come round that is not before today (a day with no year). */
function nextOccurrence(today: string, month: number, day: number): string | null {
  const { year } = parts(today);
  for (const candidate of [year, year + 1]) {
    if (real(candidate, month, day) && iso(candidate, month, day) >= today) return iso(candidate, month, day);
  }
  return null;
}

/** Context a part of a range borrows from the other: "15 to 20 Dec" gives the 15 the month of the 20. */
export interface DayContext {
  month?: number;
  year?: number;
}

/**
 * One day in words, or null. `today` is the organization's today as yyyy-mm-dd. A day already past, written with its year, is
 * null: it is never moved into the past or silently into the future.
 */
export function resolveDay(spoken: string, today: string, context: DayContext = {}): string | null {
  const text = tidy(spoken);
  if (text === "") return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return real(year, month, day) && iso(year, month, day) >= today ? iso(year, month, day) : null;
  }
  if (/^(today|aaj)$/.test(text)) return today;
  if (/^(tomorrow|kal|tmrw|tomorow)$/.test(text)) return plusDays(today, 1);
  if (/^(day after tomorrow|parso|parson)$/.test(text)) return plusDays(today, 2);
  match = /^(?:in )?(\d{1,3}) (?:days?|din)(?: baad| later)?$/.exec(text);
  if (match) return plusDays(today, Number(match[1]));
  match = /^(next |agle |is )?([a-z]+)$/.exec(text);
  if (match && weekdayOf(match[2] ?? "") !== null) {
    const wanted = weekdayOf(match[2] ?? "") ?? 0;
    // "Friday" is the next one from tomorrow on; "next Friday" is never today's.
    let gap = (wanted - weekdayOfDay(today) + 7) % 7;
    if (gap === 0) gap = 7;
    return plusDays(today, gap);
  }
  // 15/12, 15/12/2026, 15-12-2026: day first, as in India.
  match = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text);
  if (match) {
    const [day, month] = [Number(match[1]), Number(match[2])];
    const explicit = match[3] === undefined ? null : Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
    if (explicit !== null)
      return real(explicit, month, day) && iso(explicit, month, day) >= today ? iso(explicit, month, day) : null;
    return nextOccurrence(today, month, day);
  }
  // 15 dec, 15 december 2026, dec 15, december 15 2026
  match = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(text) ?? /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(text);
  if (match) {
    const first = match[1] ?? "";
    const second = match[2] ?? "";
    const [day, month] = /^\d/.test(first) ? [Number(first), monthOf(second)] : [Number(second), monthOf(first)];
    if (month === null) return null;
    if (match[3] !== undefined) {
      const year = Number(match[3]);
      return real(year, month, day) && iso(year, month, day) >= today ? iso(year, month, day) : null;
    }
    return nextOccurrence(today, month, day);
  }
  // A bare day of the month ("15"), with the month the other end of the range gave.
  match = /^(\d{1,2})$/.exec(text);
  if (match && context.month !== undefined) {
    const day = Number(match[1]);
    const year = context.year ?? parts(today).year;
    const found = real(year, context.month, day) ? iso(year, context.month, day) : null;
    return found !== null && found >= today ? found : null;
  }
  return null;
}

/** The month and year a resolved day is in, for the other end of a range to borrow. */
export const contextOf = (day: string): DayContext => ({ month: parts(day).month, year: parts(day).year });

/** A month in words ("december", "next month", "dec 2026", "2026-12") as yyyy-mm; never one that has passed. */
export function resolveMonth(spoken: string, today: string): string | null {
  const text = tidy(spoken);
  const { year, month: thisMonth } = parts(today);
  const monthString = (y: number, m: number) => `${String(y)}-${pad(m)}`;
  if (/^(this month|is mahine|is month)$/.test(text)) return monthString(year, thisMonth);
  if (/^(next month|agle mahine|agla mahina|next mahina)$/.test(text)) {
    return thisMonth === 12 ? monthString(year + 1, 1) : monthString(year, thisMonth + 1);
  }
  let match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    const [y, m] = [Number(match[1]), Number(match[2])];
    return m >= 1 && m <= 12 && monthString(y, m) >= monthString(year, thisMonth) ? monthString(y, m) : null;
  }
  match = /^(?:next )?([a-z]+)(?: (\d{4}))?$/.exec(text);
  const month = monthOf(match?.[1] ?? "");
  if (match && month !== null) {
    if (match[2] !== undefined) {
      const y = Number(match[2]);
      return monthString(y, month) >= monthString(year, thisMonth) ? monthString(y, month) : null;
    }
    return month >= thisMonth ? monthString(year, month) : monthString(year + 1, month);
  }
  return null;
}

/** The month a resolved day falls in, as yyyy-mm. */
export const monthOfDay = (day: string): string => day.slice(0, 7);

/** "5 pm", "5:30 pm", "17:00", "shaam 5 baje" as HH:MM, or null. Part-of-day words without a number don't resolve. */
export function resolveTime(spoken: string): string | null {
  const text = spoken.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  let match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)\b/.exec(text);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? "0");
    const pm = (match[3] ?? "").startsWith("p");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (hour === 12) hour = 0;
    return `${pad(hour + (pm ? 12 : 0))}:${pad(minute)}`;
  }
  match = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (match) return `${pad(Number(match[1]))}:${match[2] ?? "00"}`;
  // "5 baje": the hour with a part of the day, else daytime (7 to 11 is morning, 12 to 6 afternoon or evening).
  match = /\b(\d{1,2})\s*baje\b/.exec(text);
  if (match) {
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) return null;
    const morning = /\b(subah|morning|savere)\b/.test(text);
    const evening = /\b(shaam|sham|evening|raat|night|dopahar|afternoon)\b/.test(text);
    if (morning) return `${pad(hour === 12 ? 0 : hour)}:00`;
    if (evening || hour <= 6) return `${pad(hour === 12 ? 12 : hour + 12)}:00`;
    return `${pad(hour)}:00`;
  }
  return null;
}
