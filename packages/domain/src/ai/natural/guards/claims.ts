// G3 and G4 (spec 5, rulings 3 and 4): a claim that a payment came, the booking is confirmed or the team said something
// passes only when the data shows it true, and a discount's figure only when owner or Team text holds it.
import { paymentClaimPhrases, teamClaimPhrases } from "@travel-crm/contracts/ai";
import { formatRupees } from "../../../kernel/index.js";
import { sentencesOf } from "../../lite/phrase-match.js";
import { claimIn } from "../../lite/reply-check.js";
import { amountsIn, groundedSetOf, looseAmountsIn, withAsciiDigits, type Amount } from "./grounded.js";

/** What a guard found: nothing to check (null), true to the data, or not, with the retry the model gets. */
export type GuardOutcome = { passed: true; detail: string } | { passed: false; detail: string; retry: string } | null;

interface Span {
  start: number;
  end: number;
}
type Figure = (Span & { kind: "amount"; amount: Amount }) | (Span & { kind: "percent"; value: number });

const BOOKING_WORD = /\{bk\}|booking|seats?\b|बुकिंग|सीट/iu;
const PAYMENT_WORD = /\{pay\}|\{amount\}|payment|advance|amount|paise|paisa|पेमेंट|भुगतान|पैसे/iu;
/** The claim phrases split by what they claim, so each is checked against its own fact. */
const bookingPhrases = paymentClaimPhrases.filter((one) => BOOKING_WORD.test(one) && !PAYMENT_WORD.test(one));
const moneyPhrases = paymentClaimPhrases.filter((one) => !bookingPhrases.includes(one));

const PERCENT = /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s+cent\b|pratishat|प्रतिशत)/giu;
/** A discount word; "off" not in "off-season". */
const DISCOUNT =
  /(?<![\p{L}\p{M}])(?:discounts?|off|chhoot|chhut|choot|rebate|concession|cashback|छूट|डिस्काउंट)(?![\p{L}\p{M}-])(?!\s+season)/giu;
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

const percentsIn = (text: string) =>
  [...withAsciiDigits(text).matchAll(PERCENT)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    value: Number(m[1]),
  }));
const figuresIn = (text: string): Figure[] => [
  ...amountsIn(text).map((amount): Figure => ({ kind: "amount", start: amount.start, end: amount.end, amount })),
  ...percentsIn(text).map((percent): Figure => ({ kind: "percent", ...percent })),
];
const figureWords = (figure: Figure) =>
  figure.kind === "amount" ? formatRupees(figure.amount.paise) : `${String(figure.value)}%`;

/** Whether a text holds the figure: an amount read loosely (a Team line's "500 off"), a percent by its value. */
function holds(text: string): (figure: Figure) => boolean {
  const amounts = groundedSetOf(looseAmountsIn(text).map((one) => one.paise));
  const percents = new Set(percentsIn(text).map((one) => one.value));
  return (figure) =>
    figure.kind === "amount" ? amounts.has(figure.amount.paise, figure.amount.shorthand) : percents.has(figure.value);
}

function beside(text: string, a: Span, b: Span): boolean {
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  const between = text.slice(first.end, second.start).trim();
  return between === "" || between.split(/\s+/u).length <= MOST_WORDS_BETWEEN;
}

/**
 * G4: (a) the team credited in the past tense ("team ne bola") passes only with a Team line in this chat (the caller
 * passes those of the last 30 days) holding every amount and percent of that sentence; (b) a figure beside a discount
 * word passes only when owner or Team text holds it.
 */
export function teamWordCheck(words: string, texts: { teamText: string; ownerText: string }): GuardOutcome {
  const teamHolds = holds(texts.teamText);
  const ownerOrTeamHolds = holds(`${texts.ownerText}\n${texts.teamText}`);
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
      if (!discounts.some((word) => beside(sentence.text, figure, word))) continue;
      const detail = `${figureWords(figure)} off`;
      if (!ownerOrTeamHolds(figure)) {
        const retry = `No owner or Team text gives ${detail}: leave the discount out; if they ask for one, hand_over(discount).`;
        return { passed: false, detail, retry };
      }
      found.push(detail);
    }
  }
  return found.length === 0 ? null : { passed: true, detail: found.join("; ") };
}
