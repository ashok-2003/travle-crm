// The AI's calendar (the owner, 2026-11-02: it told customers wrong dates). A model doesn't know today's date and works
// weekdays out badly, so code does it: the prompt gets today in the agency's zone and the weeks ahead, the customer's
// dates are checked (a date that doesn't exist, a weekday that doesn't match it, a day already past) for the AI to put
// right kindly, and a weekday the AI wrote beside a date is corrected before the reply goes. English and Hinglish names.

interface Day {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HINDI_WEEKDAYS = ["Ravivar", "Somvar", "Mangalvar", "Budhvar", "Guruvar", "Shukravar", "Shanivar"];

const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY =
  "(sun(?:day)?|ravivar|raviwar|itwar|itvar|mon(?:day)?|somvar|somwar|tue(?:s|sday)?|mangalvar|mangalwar|wed(?:nesday)?|budhvar|budhwar|thu(?:r|rs|rsday)?|guruvar|guruwar|fri(?:day)?|shukravar|shukrawar|sat(?:urday)?|shanivar|shaniwar)";
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s-]*${MONTH}\\b(?:[\\s,]+(\\d{4})\\b)?`, "gi");
const MONTH_FIRST = new RegExp(`\\b${MONTH}[\\s-]*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:[\\s,]+(\\d{4})\\b)?`, "gi");
/** dd/mm/yyyy or dd.mm.yy, the Indian way; without a year "4/5" is too often a count to read as a date. */
const NUMERIC = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g;
const WEEKDAY_BEFORE = new RegExp(`\\b${WEEKDAY}[\\s,(]*(?:the\\s+)?$`, "i");
const WEEKDAY_AFTER = new RegExp(`^[\\s,(]*(?:ko\\s+)?${WEEKDAY}\\b`, "i");

const utc = (day: Day) => Date.UTC(day.year, day.month - 1, day.day);
const fromUtc = (ms: number): Day => {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const addDays = (day: Day, days: number) => fromUtc(utc(day) + days * 86_400_000);
const weekdayOf = (day: Day) => new Date(utc(day)).getUTCDay();
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** "Sat 14 Nov", with the year when asked. */
function label(day: Day, withYear = false): string {
  const words = `${(WEEKDAYS[weekdayOf(day)] ?? "").slice(0, 3)} ${String(day.day)} ${MONTHS[day.month - 1] ?? ""}`;
  return withYear ? `${words} ${String(day.year)}` : words;
}

/** Today in the agency's zone. */
function todayIn(now: Date, timeZone: string): Day {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

const monthNumber = (name: string) =>
  MONTHS.findIndex((month) => name.toLowerCase().startsWith(month.toLowerCase())) + 1;

function weekdayNumber(name: string): number {
  const word = name.toLowerCase();
  const index = WEEKDAYS.findIndex((weekday) => word.startsWith(weekday.slice(0, 3).toLowerCase()));
  if (index !== -1) return index;
  const hindi = [/^(ravi|it)/, /^som/, /^mangal/, /^budh/, /^guru/, /^shukr/, /^shani/];
  return hindi.findIndex((pattern) => pattern.test(word));
}

interface FoundDate {
  /** As written, its place in the text, and its weekday's place when one stands beside it. */
  raw: string;
  day: number;
  month: number;
  /** Written, or else the next such date from today. */
  year: number;
  yearWritten: boolean;
  weekday: { value: number; start: number; end: number } | null;
}

function findDates(text: string, today: Day): FoundDate[] {
  const found: (FoundDate & { start: number; end: number })[] = [];
  const add = (match: RegExpExecArray, day: number, month: number, year: string | undefined) => {
    const start = match.index;
    const end = start + match[0].length;
    if (found.some((other) => start < other.end && end > other.start)) return;
    const written = year === undefined ? null : Number(year.length === 2 ? `20${year}` : year);
    let guess = written ?? today.year;
    if (written === null && utc({ year: guess, month, day: Math.min(day, daysIn(guess, month)) }) < utc(today))
      guess += 1;
    const before = WEEKDAY_BEFORE.exec(text.slice(Math.max(0, start - 20), start));
    const after = WEEKDAY_AFTER.exec(text.slice(end, end + 20));
    let weekday: FoundDate["weekday"] = null;
    if (before?.[1] !== undefined) {
      const at = start - (Math.min(start, 20) - before.index);
      weekday = { value: weekdayNumber(before[1]), start: at, end: at + before[1].length };
    } else if (after?.[1] !== undefined) {
      const at = end + after[0].length - after[1].length;
      weekday = { value: weekdayNumber(after[1]), start: at, end: at + after[1].length };
    }
    found.push({ raw: match[0].trim(), day, month, year: guess, yearWritten: written !== null, weekday, start, end });
  };
  for (const match of text.matchAll(DAY_FIRST)) add(match, Number(match[1]), monthNumber(match[2] ?? ""), match[3]);
  for (const match of text.matchAll(MONTH_FIRST)) add(match, Number(match[2]), monthNumber(match[1] ?? ""), match[3]);
  for (const match of text.matchAll(NUMERIC)) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) add(match, Number(match[1]), month, match[3]);
  }
  // A weekday word that names no day is no weekday.
  return found
    .filter((date) => date.month >= 1 && date.day >= 1)
    .map((date) => (date.weekday !== null && date.weekday.value < 0 ? { ...date, weekday: null } : date));
}

/** Today, tomorrow and the eight weeks ahead in the agency's zone, and the day each coming month starts on. */
export function calendarText(now: Date, timeZone: string): string {
  const today = todayIn(now, timeZone);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit" }).format(now);
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const weeks = Array.from({ length: 9 }, (_, week) =>
    Array.from({ length: 7 }, (_, offset) => label(addDays(monday, week * 7 + offset))).join(", "),
  );
  const months = Array.from({ length: 12 }, (_, ahead) => {
    const first = {
      year: today.year + Math.floor((today.month + ahead) / 12),
      month: ((today.month + ahead) % 12) + 1,
      day: 1,
    };
    return `${MONTHS[first.month - 1] ?? ""} ${String(first.year)} starts on a ${WEEKDAYS[weekdayOf(first)] ?? ""}`;
  });
  return [
    `Today is ${WEEKDAYS[weekdayOf(today)] ?? ""}, ${String(today.day)} ${MONTHS[today.month - 1] ?? ""} ${String(today.year)}, ${time} (${timeZone}).`,
    `Tomorrow (kal) is ${label(addDays(today, 1))}; the day after (parso) is ${label(addDays(today, 2))}.`,
    "The weeks ahead, Monday to Sunday:",
    ...weeks.map((week) => `- ${week}`),
    `${months.join("; ")}.`,
  ].join("\n");
}

/** What is wrong with the dates in the customer's words, as notes for the AI to put right kindly; none when all is well. */
export function dateChecks(text: string, now: Date, timeZone: string): string[] {
  const today = todayIn(now, timeZone);
  return findDates(text, today).flatMap((date): string[] => {
    const days = daysIn(date.year, date.month);
    if (date.day > days) {
      return [
        `"${date.raw}" is not a real date: ${MONTHS[date.month - 1] ?? ""} has ${String(days)} days. Ask which date they mean.`,
      ];
    }
    const day: Day = { year: date.year, month: date.month, day: date.day };
    if (date.yearWritten && utc(day) < utc(today)) {
      return [`"${date.raw}" is already past (today is ${label(today, true)}). Ask which date they mean.`];
    }
    if (date.weekday !== null && date.weekday.value !== weekdayOf(day)) {
      const shift = ((date.weekday.value - weekdayOf(day) + 10) % 7) - 3;
      return [
        `They wrote "${date.raw}" with ${WEEKDAYS[date.weekday.value] ?? ""}, but ${label(day, true)} is a ${WEEKDAYS[weekdayOf(day)] ?? ""}; the nearest ${WEEKDAYS[date.weekday.value] ?? ""} is ${label(addDays(day, shift), true)}. Point it out kindly with the right date and confirm which one they mean.`,
      ];
    }
    if (!date.yearWritten && date.year > today.year) {
      return [
        `"${date.raw}" has passed this year: the next one is ${label(day, true)}. If it is a trip date, confirm they mean that.`,
      ];
    }
    return [];
  });
}

/** The reply with every weekday written beside a date made that date's own, in the same form (Sat, Saturday, Shanivar). */
export function fixWeekdays(reply: string, now: Date, timeZone: string): string {
  const today = todayIn(now, timeZone);
  let fixed = reply;
  const wrong = findDates(reply, today)
    .filter((date) => date.weekday !== null && date.day <= daysIn(date.year, date.month))
    .sort((a, b) => (b.weekday?.start ?? 0) - (a.weekday?.start ?? 0));
  for (const date of wrong) {
    const weekday = date.weekday;
    if (weekday === null) continue;
    const actual = weekdayOf({ year: date.year, month: date.month, day: date.day });
    if (weekday.value === actual) continue;
    const written = reply.slice(weekday.start, weekday.end);
    const hindi =
      HINDI_WEEKDAYS.some((name) => written.toLowerCase().startsWith(name.slice(0, 3).toLowerCase())) &&
      !WEEKDAYS.some((name) => written.toLowerCase().startsWith(name.slice(0, 3).toLowerCase()));
    let word = hindi ? (HINDI_WEEKDAYS[actual] ?? "") : (WEEKDAYS[actual] ?? "");
    if (!hindi && written.length <= 4) word = word.slice(0, 3);
    if (written === written.toLowerCase()) word = word.toLowerCase();
    else if (written === written.toUpperCase() && written.length > 1) word = word.toUpperCase();
    fixed = `${fixed.slice(0, weekday.start)}${word}${fixed.slice(weekday.end)}`;
  }
  return fixed;
}
