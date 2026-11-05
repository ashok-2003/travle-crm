// A season's dates as a rate sheet prints them ("1 Oct 2026", "15th December 2026", "01/10/2026", "2026-10-01"), as days, by code.
// A date with no year, or any other form, is null: the screen asks for it. The model is told to write a year when the sheet gives
// one anywhere (a title such as "Winter 2026-27"), and the year is never guessed here. Dates are day first, as in India.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (value: number) => String(value).padStart(2, "0");

function real(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists && year >= 2000 && year <= 2100 ? `${String(year)}-${pad(month)}-${pad(day)}` : null;
}

const monthNumber = (word: string): number | null => {
  const index = MONTHS.indexOf(word.slice(0, 3));
  return index < 0 || word.length < 3 ? null : index + 1;
};

/** A day as yyyy-mm-dd, or null when the printed date is not a whole day with its year. */
export function parsePrintedDay(printed: string): string | null {
  const text = printed
    .toLowerCase()
    .replace(/(\d)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return real(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (match) return real(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2}) ([a-z]+)\.? (\d{4})$/.exec(text);
  if (match) {
    const month = monthNumber(match[2] ?? "");
    return month === null ? null : real(Number(match[3]), month, Number(match[1]));
  }
  match = /^([a-z]+)\.? (\d{1,2}) (\d{4})$/.exec(text);
  if (match) {
    const month = monthNumber(match[1] ?? "");
    return month === null ? null : real(Number(match[3]), month, Number(match[2]));
  }
  return null;
}
