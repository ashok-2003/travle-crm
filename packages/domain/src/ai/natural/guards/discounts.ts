// The figures a text gives as a discount (G4, fix rounds 1 to 3), one rule for the reply and for owner or Team text:
// a percent or amount beside a discount word ("₹500 ka discount"), or with "off", "kam" or "less" straight after it
// ("10% off", "500 kam kar do"); never "drop-off", "call off", "kam se kam" or "7000 se kam". The reply alone also
// counts "10% offer"; owner or Team text grounds nothing it negates ("10% discount mat dena").
import { formatRupees } from "../../../kernel/index.js";
import { sentencesOf } from "../../lite/phrase-match.js";
import { amountsIn, looseAmountsIn, percentsIn, withAsciiDigits, type Amount, type Span } from "./amounts.js";

export type Figure = (Span & { kind: "amount"; amount: Amount }) | (Span & { kind: "percent"; value: number });

/** A discount word, on either side of its figure with at most 2 words between ("discount of 10%"). */
const DISCOUNT_WORD =
  /(?<![\p{L}\p{M}])(?:discounts?|chhoot|chhut|choot|rebate|concession|cashback|छूट|डिस्काउंट)(?![\p{L}\p{M}])/giu;
const MOST_WORDS_BETWEEN = 2;
/** Straight after a figure: "10% off" (not "off-season"), "500 kam" or "₹500 less" (not "500 kam se kam", "at least 500"). */
const AFTER_FIGURE = /^\s*(?:off(?![\p{L}\p{M}-])(?!\s+season)|(?:kam|less)(?![\p{L}\p{M}])(?!\s+se\s+kam))/iu;
/** "10% offer" in the reply (fix round 3); owner or Team text's "offer" never grounds a figure. */
const OFFER_AFTER_PERCENT = /^\s*offers?(?![\p{L}\p{M}])/iu;
/** A negation in the 3 words before a discount ("we don't give a 10% discount") or after it ("10% off mat bolna"). */
const NEGATION_WORDS = "not|never|mat|मत|don['’]?t|doesn['’]?t|isn['’]?t|can['’]?t|cannot|won['’]?t";
const NEGATION_BEFORE = new RegExp(`^(?:no|without|bina|बिना|${NEGATION_WORDS})$`, "iu");
const NEGATION_AFTER = new RegExp(`^(?:nahi|nahin|nhi|na|नहीं|नही|${NEGATION_WORDS})$`, "iu");
const NEGATION_REACH = 3;
const CLAUSE_END = /[,;:.!?()—–]/u;

export const figuresIn = (text: string, readAmounts: (text: string) => Amount[] = amountsIn): Figure[] => [
  ...readAmounts(text).map((amount): Figure => ({ kind: "amount", start: amount.start, end: amount.end, amount })),
  ...percentsIn(text).map((percent): Figure => ({ kind: "percent", ...percent })),
];

export const figureWords = (figure: Figure) =>
  figure.kind === "amount" ? formatRupees(figure.amount.paise) : `${String(figure.value)}%`;

function beside(text: string, a: Span, b: Span): boolean {
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  const between = text.slice(first.end, second.start).trim();
  return between === "" || between.split(/\s+/u).length <= MOST_WORDS_BETWEEN;
}

const wordsOf = (text: string) => text.trim().split(/\s+/u);

/** Whether a negation in the same clause governs the discount ("No discount of 10%", "10% off isn't possible"). */
function negated(sentence: string, discount: Span): boolean {
  const before = wordsOf(sentence.slice(0, discount.start).split(CLAUSE_END).at(-1) ?? "").slice(-NEGATION_REACH);
  const after = wordsOf(sentence.slice(discount.end).split(CLAUSE_END)[0] ?? "").slice(0, NEGATION_REACH);
  return before.some((word) => NEGATION_BEFORE.test(word)) || after.some((word) => NEGATION_AFTER.test(word));
}

/** The span of a figure's discount: the figure with its "off" after it, or with the discount word beside it. */
function discountOf(sentence: string, figure: Figure, words: readonly Span[], inReply: boolean): Span | null {
  const rest = sentence.slice(figure.end);
  const after =
    AFTER_FIGURE.exec(rest) ?? (inReply && figure.kind === "percent" ? OFFER_AFTER_PERCENT.exec(rest) : null);
  if (after !== null) return { start: figure.start, end: figure.end + after[0].length };
  const word = words.find((one) => beside(sentence, figure, one));
  return word === undefined ? null : { start: Math.min(figure.start, word.start), end: Math.max(figure.end, word.end) };
}

/** Each figure the text gives as a discount, and whether a negation governs it. */
function discountsIn(text: string, inReply: boolean): { figure: Figure; negated: boolean }[] {
  return sentencesOf(withAsciiDigits(text)).flatMap(({ text: sentence }) => {
    const words = [...sentence.matchAll(DISCOUNT_WORD)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
    return figuresIn(sentence, inReply ? amountsIn : looseAmountsIn).flatMap((figure) => {
      const discount = discountOf(sentence, figure, words, inReply);
      return discount === null ? [] : [{ figure, negated: negated(sentence, discount) }];
    });
  });
}

/**
 * The discount figures in the agent's reply, negated or not: one retry costs less than "10% discount nahi, 15% milega"
 * letting the 15% through unchecked.
 */
export const replyDiscountsIn = (words: string): Figure[] => discountsIn(words, true).map((one) => one.figure);

/** What owner or Team text gives as a discount: each figure no negation governs, amounts read loosely ("500 kam"). */
export function discountsGivenIn(text: string): { amountsPaise: number[]; percents: number[] } {
  const given = discountsIn(text, false).flatMap((one) => (one.negated ? [] : [one.figure]));
  return {
    amountsPaise: given.flatMap((figure) => (figure.kind === "amount" ? [figure.amount.paise] : [])),
    percents: given.flatMap((figure) => (figure.kind === "percent" ? [figure.value] : [])),
  };
}
