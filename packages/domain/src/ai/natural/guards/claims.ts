// G3 and G4 (spec 5, rulings 3 and 4): a claim that a payment came, the booking is confirmed or the team said something
// passes only when the data shows it true, and a discount's figure only when owner or Team text gives it as a discount.
import { paymentClaimPhrases, teamClaimPhrases } from "@travel-crm/contracts/ai";
import { formatRupees } from "../../../kernel/index.js";
import { sentencesOf } from "../../lite/phrase-match.js";
import { claimIn } from "../../lite/reply-check.js";
import {
  amountsIn,
  discountFiguresIn,
  looseAmountsIn,
  percentsIn,
  withAsciiDigits,
  type Amount,
  type Span,
} from "./amounts.js";
import { groundedSetOf } from "./grounded.js";

/** What a guard found: nothing to check (null), true to the data, or not, with the retry the model gets. */
export type GuardOutcome = { passed: true; detail: string } | { passed: false; detail: string; retry: string } | null;

type Figure = (Span & { kind: "amount"; amount: Amount }) | (Span & { kind: "percent"; value: number });

const BOOKING_WORD = /\{bk\}|booking|seats?\b|बुकिंग|सीट/iu;
const PAYMENT_WORD = /\{pay\}|\{amount\}|payment|advance|amount|paise|paisa|पेमेंट|भुगतान|पैसे/iu;
/** The claim phrases split by what they claim, so each is checked against its own fact. */
const bookingPhrases = paymentClaimPhrases.filter((one) => BOOKING_WORD.test(one) && !PAYMENT_WORD.test(one));
const moneyPhrases = paymentClaimPhrases.filter((one) => !bookingPhrases.includes(one));

/** A discount word beside a figure, on either side ("₹500 ka discount", "discount of 10%"). */
const DISCOUNT =
  /(?<![\p{L}\p{M}])(?:discounts?|chhoot|chhut|choot|rebate|concession|cashback|छूट|डिस्काउंट)(?![\p{L}\p{M}])/giu;
/** "off" right after a figure ("₹500 off", "10% off"); never "drop-off" or "off-season". */
const OFF_AFTER = /^\s*off(?![\p{L}\p{M}-])(?!\s+season)/iu;
/** A figure is beside a discount word with at most this many words between them ("₹500 ka discount"). */
const MOST_WORDS_BETWEEN = 2;

const PAYMENT_RETRY =
  "No payment is recorded on this chat yet: don't say it came; say the team checks it and confirms here.";
const BOOKING_RETRY =
  "The booking isn't confirmed yet: don't say it is; say the team confirms it here once the payment is checked.";
const NO_TEAM_LINE =
  "No Team line in this chat says that: don't credit the team with it; say you'll check with them instead.";

/** G3: each payment or booking claim, checked against what the team recorded. */
export function paymentClaimCheck(
  words: string,
  data: { paymentConfirmed: boolean; bookingConfirmed: boolean },
): GuardOutcome {
  const kinds = [
    { phrases: moneyPhrases, confirmed: data.paymentConfirmed, retry: PAYMENT_RETRY },
    { phrases: bookingPhrases, confirmed: data.bookingConfirmed, retry: BOOKING_RETRY },
  ];
  const claims: string[] = [];
  // "received your ₹९,०००" is "received your {amount}": the phrases read ASCII digits; the spans hold for `words`.
  for (const sentence of sentencesOf(withAsciiDigits(words))) {
    for (const { phrases, confirmed, retry } of kinds) {
      const claim = claimIn(sentence, phrases);
      if (claim === null) continue;
      const detail = words.slice(claim.start, claim.end);
      if (!confirmed) return { passed: false, detail, retry };
      claims.push(detail);
    }
  }
  return claims.length === 0 ? null : { passed: true, detail: claims.join("; ") };
}

const figuresIn = (text: string): Figure[] => [
  ...amountsIn(text).map((amount): Figure => ({ kind: "amount", start: amount.start, end: amount.end, amount })),
  ...percentsIn(text).map((percent): Figure => ({ kind: "percent", ...percent })),
];
const figureWords = (figure: Figure) =>
  figure.kind === "amount" ? formatRupees(figure.amount.paise) : `${String(figure.value)}%`;

/** Whether these figures hold one: an amount (a Team line's "500" counts) or a percent, by its value. */
function holds(amounts: readonly Amount[], percents: readonly number[]): (figure: Figure) => boolean {
  const amountSet = groundedSetOf(amounts.map((one) => one.paise));
  const percentSet = new Set(percents);
  return (figure) =>
    figure.kind === "amount"
      ? amountSet.has(figure.amount.paise, figure.amount.shorthand)
      : percentSet.has(figure.value);
}

function beside(text: string, a: Span, b: Span): boolean {
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  const between = text.slice(first.end, second.start).trim();
  return between === "" || between.split(/\s+/u).length <= MOST_WORDS_BETWEEN;
}

/**
 * G4: (a) the team credited in the past tense ("team ne bola") passes only with a Team line in this chat (the caller
 * passes those of the last 30 days) holding every amount and percent of that sentence; (b) a discount figure (beside a
 * discount word, or "off" right after it) passes only when owner or Team text gives that figure in a sentence with a
 * discount word (fix round 1), so the cancellation's "50% back" or "plus 5% GST" never grounds "50% off".
 */
export function teamWordCheck(words: string, texts: { teamText: string; ownerText: string }): GuardOutcome {
  const teamHolds = holds(
    looseAmountsIn(texts.teamText),
    percentsIn(texts.teamText).map((one) => one.value),
  );
  const given = discountFiguresIn(`${texts.ownerText}\n${texts.teamText}`);
  const givenAsDiscount = holds(given.amounts, given.percents);
  const found: string[] = [];
  for (const sentence of sentencesOf(withAsciiDigits(words))) {
    const claim = claimIn(sentence, teamClaimPhrases);
    if (claim !== null) {
      const detail = words.slice(claim.start, claim.end);
      if (texts.teamText.trim() === "") return { passed: false, detail, retry: NO_TEAM_LINE };
      const unsaid = figuresIn(sentence.text).find((figure) => !teamHolds(figure));
      if (unsaid !== undefined) {
        const retry = `The Team lines don't say ${figureWords(unsaid)}: quote the team's own figure, or leave it out.`;
        return { passed: false, detail, retry };
      }
      found.push(detail);
    }
    const discounts = [...sentence.text.matchAll(DISCOUNT)].map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
    }));
    for (const figure of figuresIn(sentence.text)) {
      const off = OFF_AFTER.test(sentence.text.slice(figure.end));
      if (!off && !discounts.some((word) => beside(sentence.text, figure, word))) continue;
      const detail = `${figureWords(figure)} off`;
      if (!givenAsDiscount(figure)) {
        const retry = `No owner or Team text gives ${detail}: leave the discount out; if they ask for one, hand_over(discount).`;
        return { passed: false, detail, retry };
      }
      found.push(detail);
    }
  }
  return found.length === 0 ? null : { passed: true, detail: found.join("; ") };
}
