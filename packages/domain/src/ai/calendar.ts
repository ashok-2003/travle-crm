// The AI's calendar (the owner, 2026-11-02: it told customers wrong dates). A model doesn't know today's date and works
// weekdays out badly, so code does it: the prompt gets today in the agency's zone and the weeks ahead.

interface Day {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const utc = (day: Day) => Date.UTC(day.year, day.month - 1, day.day);
const fromUtc = (ms: number): Day => {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const addDays = (day: Day, days: number) => fromUtc(utc(day) + days * 86_400_000);
const weekdayOf = (day: Day) => new Date(utc(day)).getUTCDay();

/** "Sat 14 Nov". */
const label = (day: Day) =>
  `${(WEEKDAYS[weekdayOf(day)] ?? "").slice(0, 3)} ${String(day.day)} ${MONTHS[day.month - 1] ?? ""}`;

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
