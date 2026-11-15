// Reads money and percents in words for the guards: "₹9,499", "12k", "1.2 lakh", "8 hazaar" and a bare "7999", with
// Devanagari digits read as digits; and the figures that owner or Team text gives as a discount.
import { amountsAndDatesIn } from "@travel-crm/contracts/ai";
import { paiseFromSpoken } from "../../fill/money.js";
import { sentencesOf } from "../../lite/phrase-match.js";

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

/** "₹९,४९९" reads "₹9,499": each Devanagari digit becomes its ASCII digit, one character for one, so spans hold. */
export const withAsciiDigits = (text: string): string =>
  text.replace(/[\u0966-\u096F]/gu, (digit) => String(digit.charCodeAt(0) - DEVANAGARI_ZERO));

/** "8 hazaar", "8 thousand", "8 हज़ार" (pre-flight #15), but not a height or a distance ("12 thousand feet"). */
const THOUSANDS =
  /(?<![\d.,])(\d+(?:\.\d+)?)\s*(?:hazaa?r|hajaa?r|thousand|ह(?:ज\u093C?|\u095B)ार)(?![\p{L}\p{M}])(?!\s*(?:ft|feet|m|metres?|meters?|kms?|kilometres?|kilometers?)\b)/giu;
const SHORTHAND = /\d\s*(?:k|l|lakhs?|lacs?|crores?|cr)(?![\p{L}])/iu;
/** A number standing by itself, grouped or not: no letter, digit, dot, colon, slash or plus touches it ("T1", "18:30"). */
const BARE_NUMBER = /(?<![\p{L}\p{M}\d.,:/+])\d+(?:,\d+)*(?:\.\d+)?(?![\p{L}\p{M}\d]|[.,:/]\d)/gu;
/** A phone: 10 or more digits in a run (a space or a hyphen may split it), or a number starting +91. */
const PHONE = /\+\s?91[\s-]?\d(?:[\s-]?\d)*|(?<![\d,])\d(?:[\s-]?\d){9,}(?![\d,])/gu;
const YEAR = /^(?:20\d{2}|2100)$/u;
/** A count, a size or a time after a number: "4 nights", "12,500 ft", "500 log", "6 am". */
const UNIT_AFTER =
  /^\s*(?:nights?|days?|din|raat|kms?|ft|feet|m|mtrs?|metres?|meters?|people|persons?|pax|log|seats?|%|am|pm|kgs?|years?|yrs?|saal|hrs?|hours?)(?![\p{L}\p{M}])/iu;
const PERCENT = /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s+cent\b|pratishat|प्रतिशत)/giu;
/** A word that makes a sentence of owner or Team text give a discount (fix round 1). */
const GIVES_DISCOUNT =
  /(?<![\p{L}\p{M}])(?:off|discounts?|chhoot|chhut|choot|kam|less|rebate|offers?|concession|cashback|छूट|डिस्काउंट)(?![\p{L}\p{M}])/iu;

export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const spansOf = (text: string, pattern: RegExp): Span[] =>
  [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
const paiseOfNumber = (written: string) => Math.round(Number(written.replaceAll(",", "")) * 100);

/**
 * Bare numbers of ₹500 or more (fix round 1's ruling): "Sirf 7999 lagenge", "7,999 me ho jayega". Not a year alone, a
 * phone, a time, a date, a number another reader took, or one a unit follows ("12,500 ft", "6 am").
 */
function bareAmounts(digits: string, taken: readonly Span[]): Amount[] {
  const skip = [...taken, ...spansOf(digits, PHONE)];
  return [...digits.matchAll(BARE_NUMBER)].flatMap((m) => {
    const span = { start: m.index, end: m.index + m[0].length };
    const paise = paiseOfNumber(m[0]);
    const notMoney =
      paise < LEAST_BARE_PAISE ||
      YEAR.test(m[0]) ||
      UNIT_AFTER.test(digits.slice(span.end)) ||
      skip.some((one) => overlaps(one, span));
    return notMoney ? [] : [{ ...span, paise, shorthand: false }];
  });
}

/** Every amount of money in the words, in order: what the reply check reads as money, thousands in words, bare numbers. */
export function amountsIn(text: string): Amount[] {
  const digits = withAsciiDigits(text);
  const thousands = [...digits.matchAll(THOUSANDS)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    paise: Math.round(Number(m[1]) * 100_000),
    shorthand: true,
  }));
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

/**
 * The amounts and percents owner or Team text gives as a discount (fix round 1's ruling): each in a sentence that holds a
 * discount word, so a cancellation's "50% back" or "plus 5% GST" never grounds "50% off".
 */
export function discountFiguresIn(text: string): { amounts: Amount[]; percents: number[] } {
  const giving = sentencesOf(text).filter((sentence) => GIVES_DISCOUNT.test(sentence.text));
  return {
    amounts: giving.flatMap((sentence) => looseAmountsIn(sentence.text)),
    percents: giving.flatMap((sentence) => percentsIn(sentence.text).map((one) => one.value)),
  };
}
