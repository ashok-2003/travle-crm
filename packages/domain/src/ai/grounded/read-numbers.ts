// Whether a read's number is the one the customer's evidence says: a count, a room count, the day of a date, a month or a
// budget stands only on its own value (digits, or its number word), and a trip's length ("5N6D", "5 nights") is no count.
import { wordsOf } from "./read-words.js";

const numberWordValues = new Map<string, number>(
  [
    "one two three four five six seven eight nine ten",
    "ek do teen char paanch chhe saat aath nau das",
    "एक दो तीन चार पाँच छह सात आठ नौ दस",
  ].flatMap((list) => list.split(" ").map((word, index): [string, number] => [word, index + 1])),
);
for (const [word, value] of [
  ["panch", 5],
  ["che", 6],
  ["पांच", 5],
  ["छः", 6],
] as const) {
  numberWordValues.set(word, value);
}

/** What follows a number when it is a trip's length, not a count: "5N6D", "5 nights", "6 din". */
const TRIP_UNIT = /^(?:n|d|nts?|nights?|days?|din|raat\w*|दिन|रात\S*)$/u;
/** What follows a number when it counts people or things, never a day or a month. */
const COUNT_UNIT =
  /^(?:people|persons?|pax|adults?|log|kids?|child|children|members?|travell?ers?|rooms?|seats?|k|thousand|hazaa?r|hajar|lakhs?|lacs?|l|crores?|cr|rs|rupees?)$/u;
const MULTIPLIER: [RegExp, number][] = [
  [/^(?:k|thousand|hazaa?r|hajar)$/u, 1_000],
  [/^(?:lakhs?|lacs?|l)$/u, 100_000],
  [/^(?:crores?|cr)$/u, 10_000_000],
];
const ROOM_WORDS = new Set(["single", "double", "triple", "quad", "twin", "solo", "couple"]);
const MONTHS = [
  ["jan", "january"],
  ["feb", "february"],
  ["mar", "march"],
  ["apr", "april"],
  ["may"],
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "sept", "september"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
];

interface Said {
  value: number;
  /** The word right after the number ("" for none): "n" in "5N6D", "adults" in "2 adults", "k" in "45k". */
  unit: string;
}

/** Every number the evidence says: digits (Devanagari ones too, "1.5" and "45,000" whole) and number words. */
function numbersIn(evidence: string): Said[] {
  const text = evidence.toLowerCase().replace(/[०-९]/gu, (digit) => String((digit.codePointAt(0) ?? 0x0966) - 0x0966));
  const digits = [...text.matchAll(/(?<![\d.,])(\d+(?:,\d+)*(?:\.\d+)?)\s*([\p{L}\p{M}]*)/gu)].map((m) => ({
    value: Number((m[1] ?? "").replaceAll(",", "")),
    unit: m[2] ?? "",
  }));
  const words = wordsOf(evidence);
  const named = words.flatMap((word, index) => {
    const value = numberWordValues.get(word);
    return value === undefined ? [] : [{ value, unit: words[index + 1] ?? "" }];
  });
  return [...digits, ...named];
}

/** A traveller count: the number itself, or the people counted apart ("2 adults 1 child" is 3); never a trip's length. */
export function saysCount(evidence: string, count: number): boolean {
  const counts = numbersIn(evidence).filter((said) => !TRIP_UNIT.test(said.unit));
  const sum = counts.reduce((total, said) => total + said.value, 0);
  return counts.some((said) => said.value === count) || (counts.length > 1 && sum === count);
}

/** A room count: its number, or one room said by its type ("double sharing"). */
export function saysRoomCount(evidence: string, count: number): boolean {
  if (numbersIn(evidence).some((said) => said.value === count && !TRIP_UNIT.test(said.unit))) return true;
  return count === 1 && wordsOf(evidence).some((word) => ROOM_WORDS.has(word));
}

const asADay = (said: Said) => !TRIP_UNIT.test(said.unit) && !COUNT_UNIT.test(said.unit);

/** A date's day: its own number, never a count of people or nights ("12 people" is no 12th). */
export function saysDay(evidence: string, date: string): boolean {
  const day = Number(date.slice(8, 10));
  return numbersIn(evidence).some((said) => said.value === day && asADay(said));
}

/** A month (YYYY-MM): its name, or its number. */
export function saysMonth(evidence: string, month: string): boolean {
  const number = Number(month.slice(5, 7));
  const words = new Set(wordsOf(evidence));
  if ((MONTHS[number - 1] ?? []).some((name) => words.has(name))) return true;
  return numbersIn(evidence).some((said) => said.value === number && asADay(said));
}

/** A budget in rupees: a number in the evidence that is that amount, with its "k", "lakh" or "crore". */
export function saysAmount(evidence: string, rupees: number): boolean {
  return numbersIn(evidence).some((said) => {
    const multiplier = MULTIPLIER.find(([unit]) => unit.test(said.unit))?.[1] ?? 1;
    return Math.round(said.value * multiplier) === rupees;
  });
}
