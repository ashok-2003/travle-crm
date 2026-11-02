// A date of birth, issue or expiry read out of a voice note or a printed page, by code. Only a COMPLETE date counts (a day, a
// month and a four-digit year): "12 years old", "March 1980" or "15/03" are not dates, so an age never becomes a birthday
// that would mark a traveller's row complete wrongly.
import { monthOf } from "./dates.js";

const pad = (value: number) => String(value).padStart(2, "0");

function real(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const fine =
    year >= 1900 &&
    year <= 2200 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return fine ? `${String(year)}-${pad(month)}-${pad(day)}` : null;
}

/** "1980-03-15", "15/03/1980", "15-3-1980", "15 March 1980", "March 15, 1980" as yyyy-mm-dd; less than a full date is null. */
export function resolveFullDate(spoken: string): string | null {
  const text = spoken
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,.]/g, " ")
    .replace(/\b(of|on|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return real(Number(match[1]), Number(match[2]), Number(match[3]));
  // Day first, as in India.
  match = /^(\d{1,2})[/ -](\d{1,2})[/ -](\d{4})$/.exec(text);
  if (match) return real(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(text);
  if (match) {
    const month = monthOf(match[2] ?? "");
    return month === null ? null : real(Number(match[3]), month, Number(match[1]));
  }
  match = /^([a-z]+) (\d{1,2}) (\d{4})$/.exec(text);
  if (match) {
    const month = monthOf(match[1] ?? "");
    return month === null ? null : real(Number(match[3]), month, Number(match[2]));
  }
  return null;
}

/** A date of birth: a full date, not in the future and not more than 120 years back. */
export function resolveBirthDate(spoken: string, today: string): string | null {
  const day = resolveFullDate(spoken);
  if (day === null || day > today) return null;
  const earliest = `${String(Number(today.slice(0, 4)) - 120)}${today.slice(4)}`;
  return day < earliest ? null : day;
}
