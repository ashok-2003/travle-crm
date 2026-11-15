// Reads money and percents in words for the guards: "₹9,499", "12k", "1.2 lakh", "8 hazaar" and a bare "7999", with
// Devanagari digits read as digits; a bare number that is a year, a pincode, a time or a size is no amount.
import { amountsAndDatesIn, indianTravelPlaces } from "@travel-crm/contracts/ai";
import { monthOf } from "../../fill/dates.js";
import { paiseFromSpoken } from "../../fill/money.js";

export interface Span {
  start: number;
  end: number;
}

/** An amount of money in words, where it is, and whether it was written rounded ("12k", "8 hazaar"). */
export interface Amount extends Span {
  paise: number;
  shorthand: boolean;
}

const DEVANAGARI_ZERO = 0x0966;
/** A bare number in the agent's words is money from ₹500 up (fix round 1); in a Team line or owner text, from ₹100. */
const LEAST_BARE_PAISE = 50_000;
const LEAST_LOOSE_PAISE = 10_000;

/** Hindi month names, NFC (a nukta stays a separate mark): सितंबर or सितम्बर, अक्टूबर or अक्तूबर. */
export const HINDI_MONTHS = [
  "जनवरी",
  "फ\u093C?रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सित(?:ं|म्)बर",
  "अक्(?:टू|तू)बर",
  "नव(?:ं|म्)बर",
  "दिस(?:ं|म्)बर",
];

/** "₹९,४९९" reads "₹9,499": each Devanagari digit becomes its ASCII digit, one character for one, so spans hold. */
export const withAsciiDigits = (text: string): string =>
  text.replace(/[\u0966-\u096F]/gu, (digit) => String(digit.charCodeAt(0) - DEVANAGARI_ZERO));

/** "8 hazaar", "8 thousand", "8 हज़ार" (pre-flight #15). */
const THOUSANDS = /(?<![\d.,])(\d+(?:\.\d+)?)\s*(?:hazaa?r|hajaa?r|thousand|ह(?:ज\u093C?|\u095B)ार)(?![\p{L}\p{M}])/giu;
const SHORTHAND = /\d\s*(?:k|l|lakhs?|lacs?|crores?|cr)(?![\p{L}])/iu;
/** A number standing by itself, grouped or not: no letter, digit, dot, colon, slash or plus touches it ("T1", "18:30"). */
const BARE_NUMBER = /(?<![\p{L}\p{M}\d.,:/+])\d+(?:,\d+)*(?:\.\d+)?(?![\p{L}\p{M}\d]|[.,:/]\d)/gu;
/** A phone: 10 or more digits in a run (a space or a hyphen may split it), or a number starting +91. */
const PHONE = /\+\s?91[\s-]?\d(?:[\s-]?\d)*|(?<![\d,])\d(?:[\s-]?\d){9,}(?![\d,])/gu;
/** A count, a size or a time after a number, with a space or a hyphen: "4 nights", "3,800-metre", "500 log", "6 am". */
const UNITS = [
  ...["nights?", "days?", "din", "raat", "kms?", "kilomet(?:re|er)s?", "ft", "feet", "foot", "m", "mts", "mtrs?"],
  ...["metres?", "meters?", "people", "persons?", "pax", "log", "seats?", "%", "am", "pm", "kgs?", "years?", "yrs?"],
  ...["saal", "hrs?", "hours?", "मीटर", "मी", "फ\u093C?ीट", "\u095Eीट", "फुट", "किमी", "किलोमीटर", "लोग", "रात"],
  ...["दिन", "सीटें", "सीट", "साल"],
];
const UNIT_AFTER = new RegExp(`^\\s*-?\\s*(?:${UNITS.join("|")})(?![\\p{L}\\p{M}])`, "iu");
/** 2020 to 2035 is a year only beside a month, a weekday or a year word (fix round 2); else it is money. */
const YEAR = /^20(?:2\d|3[0-5])$/u;
const YEAR_WORD = new RegExp(
  `^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|(?:mon|tues|wednes|thurs|fri|satur|sun)day|batch(?:es)?|years?|saal|सन|साल|${HINDI_MONTHS.join("|")})$`,
  "iu",
);
/** A pincode: six digits after "pin" or a place ("Dehradun 248001"). */
const PINCODE = /^[1-8]\d{5}$/u;
const placeWords = indianTravelPlaces.map((place) =>
  place.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+"),
);
const PIN_BEFORE = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:pin(?:\\s*code)?|pincode|पिन(?:\\s*कोड)?|${placeWords.join("|")})\\s*[,:-]?\\s*$`,
  "iu",
);
const PERCENT = /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s+cent\b|pratishat|प्रतिशत)/giu;

export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const spansOf = (text: string, pattern: RegExp): Span[] =>
  [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
const paiseOfNumber = (written: string) => Math.round(Number(written.replaceAll(",", "")) * 100);
const unitAfter = (text: string, span: Span) => UNIT_AFTER.test(text.slice(span.end));

/** A year by its neighbours: the 2 words on either side ("2026 batch", "Batch of 2026", "next year 2027"). */
function isYear(text: string, span: Span): boolean {
  if (!YEAR.test(text.slice(span.start, span.end))) return false;
  const near = [
    ...text.slice(0, span.start).trim().split(/\s+/u).slice(-2),
    ...text.slice(span.end).trim().split(/\s+/u).slice(0, 2),
  ].map((word) => word.normalize("NFC").replace(/[^\p{L}\p{M}]/gu, ""));
  return near.some((word) => YEAR_WORD.test(word) || monthOf(word.toLowerCase()) !== null);
}

const isPincode = (text: string, span: Span) =>
  PINCODE.test(text.slice(span.start, span.end)) &&
  PIN_BEFORE.test(text.slice(Math.max(0, span.start - 40), span.start));

/**
 * Bare numbers of ₹500 or more (fix rounds 1 and 2): "Sirf 7999 lagenge", "7,999 me ho jayega". Not a year, a pincode,
 * a phone, a time ("0630", "18:30", "6 am"), a date, a number another reader took, or one a unit follows ("12,500 ft").
 */
function bareAmounts(digits: string, taken: readonly Span[]): Amount[] {
  const skip = [...taken, ...spansOf(digits, PHONE)];
  return [...digits.matchAll(BARE_NUMBER)].flatMap((m) => {
    const span = { start: m.index, end: m.index + m[0].length };
    const paise = paiseOfNumber(m[0]);
    const notMoney =
      paise < LEAST_BARE_PAISE ||
      m[0].startsWith("0") ||
      isYear(digits, span) ||
      isPincode(digits, span) ||
      unitAfter(digits, span) ||
      skip.some((one) => overlaps(one, span));
    return notMoney ? [] : [{ ...span, paise, shorthand: false }];
  });
}

/** Every amount of money in the words, in order: what the reply check reads as money, thousands in words, bare numbers. */
export function amountsIn(text: string): Amount[] {
  const digits = withAsciiDigits(text);
  const thousands = [...digits.matchAll(THOUSANDS)].flatMap((m) => {
    const span = { start: m.index, end: m.index + m[0].length };
    // "12 thousand feet" is a height.
    return unitAfter(digits, span) ? [] : [{ ...span, paise: Math.round(Number(m[1]) * 100_000), shorthand: true }];
  });
  const found = amountsAndDatesIn(digits);
  const written = found.flatMap((span) => {
    if (span.kind !== "money" || thousands.some((one) => overlaps(one, span))) return [];
    const words = digits.slice(span.start, span.end);
    const paise = paiseFromSpoken(words.replace("/-", "").replace(/crores/giu, "crore"));
    return paise === null ? [] : [{ start: span.start, end: span.end, paise, shorthand: SHORTHAND.test(words) }];
  });
  const bare = bareAmounts(digits, [...thousands, ...found]);
  return [...thousands, ...written, ...bare].sort((a, b) => a.start - b.start);
}

/** As `amountsIn`, plus every bare number of ₹100 or more: a Team line says "8500 me de do", a customer "budget 5000". */
export function looseAmountsIn(text: string): Amount[] {
  const amounts = amountsIn(text);
  const bare = [...withAsciiDigits(text).matchAll(BARE_NUMBER)].flatMap((m) => {
    const span = { start: m.index, end: m.index + m[0].length };
    const paise = paiseOfNumber(m[0]);
    return amounts.some((one) => overlaps(one, span)) || paise < LEAST_LOOSE_PAISE
      ? []
      : [{ ...span, paise, shorthand: false }];
  });
  return [...amounts, ...bare];
}

export const percentsIn = (text: string): (Span & { value: number })[] =>
  [...withAsciiDigits(text).matchAll(PERCENT)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    value: Number(m[1]),
  }));
