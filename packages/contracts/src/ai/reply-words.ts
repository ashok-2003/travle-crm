// Finds the amounts and dates in a reply, and re-exports the word lists and payment details the reply check shares.
export * from "./indian-travel-places.js";
export * from "./payment-words.js";
export * from "./reply-phrases.js";

export interface AmountOrDate {
  start: number;
  end: number;
  kind: "money" | "date";
}

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY =
  "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?|somvar|mangalvar|budhvar|guruvar|brihaspativar|shukravar|shanivar|ravivar";
const RELATIVE = `(?:kal|parso|tomorrow|today|${WEEKDAY})`;
const ORDINAL = "(?:st|nd|rd|th)?";
// A number that is a count, a time or a size, not a day: "Dec 5 nights", "tomorrow 2 adults", "Saturday 5 pm".
const NOT_A_DAY =
  "(?!\\s*(?:nights?|days?|[nd]\\b|adults?|child|children|kids?|people|persons?|pax|rooms?|seats?|ft|km|kms|m\\b|am|pm|baje|bje|:)|[,.]?\\d)";
const DAY = `(?<![\\d/.+-])\\d{1,2}${ORDINAL}\\b`;
const YEAR = "(?:\\s*,?\\s*(?:20)?\\d{2}(?!\\d))?";

const DATE_PATTERNS: RegExp[] = [
  new RegExp(`${DAY}\\s*(?:of\\s+)?\\b${MONTH}\\b${YEAR}`, "gi"),
  new RegExp(`\\b${MONTH}\\b\\.?\\s*${DAY}${NOT_A_DAY}${YEAR}`, "gi"),
  /(?<![\d/.+-])\d{1,2}\.\d{1,2}\.\d{2,4}(?![\d.])/g,
  new RegExp(`\\b${MONTH}\\b\\.?\\s*,?\\s*20\\d{2}(?!\\d)`, "gi"),
  /(?<![\d/.+-])(?!24\/7)\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![\d/]|\s*(?:nights?|days?|adults?|people|persons?|pax|kids?|children|rooms?|seats?|[nd]\b))/gi,
  new RegExp(`\\b${RELATIVE}\\b\\s*,?\\s*${DAY}${NOT_A_DAY}(?:\\s*(?:ko|tarikh|tareekh))?`, "gi"),
  new RegExp(`${DAY}(?:\\s*(?:ko|tarikh|tareekh))?\\s*,?\\s*\\b${WEEKDAY}\\b`, "gi"),
  new RegExp(`\\b(?:this|next|coming)\\s+(?:${WEEKDAY})\\b`, "gi"),
];

const NUMBER = "\\d+(?:,\\d+)*(?:\\.\\d+)?";
const CURRENCY_BEFORE = new RegExp(
  `(?:₹|\\bRs\\.?|\\bINR\\b)\\s*${NUMBER}(?:\\s?(?:[kK]|L|[Ll]akhs?|[Ll]acs?|[Cc]rores?)\\b)?`,
  "g",
);
const CURRENCY_AFTER = new RegExp(
  `(?<![\\d,.])${NUMBER}\\s*(?:/-|rupees?|rupaye|रुपये|रुपए|₹|\\brs\\b|\\binr\\b)`,
  "gi",
);
const SHORT_FORM = new RegExp(`(?<![\\w.,])${NUMBER}(?:\\s?[kK]|L|\\s[Ll]akhs?|\\s?[Ll]acs?)\\b`, "g");
const BIG_NUMBER = /(?<![\d,.+])(?:\d{1,3}(?:,\d{2,3})+|\d{4,9})(?![\d,]\d|\d)/g;
const MONEY_WORDS =
  /\b(?:per\s+person|per\s+head|per\s+pax|pp|each|total|advance|price|cost|only|rate|package|booking)\b/i;
// A year (2020-2035) beside a money word is a year, unless a currency mark joins it, which the other patterns catch.
const PLAUSIBLE_YEAR = /^20(?:2\d|3[0-5])$/;
const NOT_MONEY_UNIT = /^\s*(?:ft|feet|m\b|metres?|meters?|km|kms|kilomet|mtrs?|mts)/i;
const PHONE =
  /(?:\+\s?\d{1,3}[\s-]?)?(?<![\d])(?:[6-9]\d{4}[\s-]?\d{5}|\d{3,5}[\s-]\d{3,5}[\s-]\d{3,5})(?!\d)|\+\d{1,3}[\s-]?\d[\d\s-]{6,}\d/g;

function collect(text: string, patterns: RegExp[], kind: AmountOrDate["kind"]): AmountOrDate[] {
  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind })),
  );
}

const nearMoneyWord = (text: string, start: number, end: number): boolean => {
  const before = text.slice(0, start).split(/\s+/).slice(-5).join(" ");
  const after = text.slice(end).split(/\s+/).slice(0, 4).join(" ");
  return MONEY_WORDS.test(before) || MONEY_WORDS.test(after);
};

function bareNumbers(text: string): AmountOrDate[] {
  const phones = [...text.matchAll(PHONE)].map((m) => ({ from: m.index, to: m.index + m[0].length }));
  return [...text.matchAll(BIG_NUMBER)]
    .map((m) => ({ start: m.index, end: m.index + m[0].length, kind: "money" as const }))
    .filter(({ start, end }) => !phones.some(({ from, to }) => start >= from && end <= to))
    .filter(({ start, end }) => !PLAUSIBLE_YEAR.test(text.slice(start, end)))
    .filter(({ start, end }) => !NOT_MONEY_UNIT.test(text.slice(end)) && nearMoneyWord(text, start, end));
}

/** Every amount of money and date in the text, in order, overlapping ones merged (a date wins over money). */
export function amountsAndDatesIn(text: string): AmountOrDate[] {
  const dates = collect(text, DATE_PATTERNS, "date");
  const money = [...collect(text, [CURRENCY_BEFORE, CURRENCY_AFTER, SHORT_FORM], "money"), ...bareNumbers(text)].filter(
    (m) => !dates.some((d) => m.start < d.end && d.start < m.end),
  );
  const sorted = [...dates, ...money].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: AmountOrDate[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      if (span.kind === "date") last.kind = "date";
    } else merged.push({ ...span });
  }
  return merged;
}

/** The text with every amount and date taken out and the gaps closed, so a lesson keeps its wording but no figure. */
export function withoutAmountsAndDates(text: string): string {
  let result = text;
  for (const { start, end } of amountsAndDatesIn(text).reverse()) result = result.slice(0, start) + result.slice(end);
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}
