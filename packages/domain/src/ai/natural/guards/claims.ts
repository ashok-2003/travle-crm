// G3 and G4 (spec 5, rulings 3 and 4): a claim that a payment came, the booking is confirmed or the team said something
// passes only when the data shows it true, and a discount's figure only when owner or Team text gives it as a discount.
import { paymentClaimPhrases, teamClaimPhrases } from "@travel-crm/contracts/ai";
import { sentencesOf } from "../../lite/phrase-match.js";
import { claimIn } from "../../lite/reply-check.js";
import { looseAmountsIn, percentsIn, withAsciiDigits } from "./amounts.js";
import { discountsGivenIn, figuresIn, figureWords, replyDiscountsIn, type Figure } from "./discounts.js";
import { groundedSetOf } from "./grounded.js";

/** What a guard found: nothing to check (null), true to the data, or not, with the retry the model gets. */
export type GuardOutcome = { passed: true; detail: string } | { passed: false; detail: string; retry: string } | null;

const BOOKING_WORD = /\{bk\}|booking|seats?\b|बुकिंग|सीट/iu;
const PAYMENT_WORD = /\{pay\}|\{amount\}|payment|advance|amount|paise|paisa|पेमेंट|भुगतान|पैसे/iu;
/** The claim phrases split by what they claim, so each is checked against its own fact. */
const bookingPhrases = paymentClaimPhrases.filter((one) => BOOKING_WORD.test(one) && !PAYMENT_WORD.test(one));
const moneyPhrases = paymentClaimPhrases.filter((one) => !bookingPhrases.includes(one));

const PAYMENT_RETRY =
  "No payment is recorded on this chat yet: don't say it came; say you'll check it and confirm here.";
const BOOKING_RETRY =
  "The booking isn't confirmed yet: don't say it is; say you'll confirm it here once the payment is checked.";
const NO_TEAM_LINE =
  "No Team line in this chat says that: don't credit the team with it; say you'll check and come back instead.";

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

/** Whether these figures hold one: an amount (a Team line's "500" counts) or a percent, by its value. */
function holds(amountsPaise: readonly number[], percents: readonly number[]): (figure: Figure) => boolean {
  const amountSet = groundedSetOf(amountsPaise);
  const percentSet = new Set(percents);
  return (figure) =>
    figure.kind === "amount"
      ? amountSet.has(figure.amount.paise, figure.amount.shorthand)
      : percentSet.has(figure.value);
}

/**
 * G4: (a) the team credited in the past tense ("team ne bola") passes only with a Team line in this chat (the caller
 * passes those of the last 30 days) holding every amount and percent of that sentence; (b) a discount figure passes only
 * when owner or Team text gives that figure as a discount by the same rules (`discounts.ts`, fix rounds 1 and 2), so a
 * cancellation's "50% back" or "plus 5% GST" never grounds "50% off". The reply's discounts count even when negated:
 * one retry costs less than a figure nobody gave.
 */
export function teamWordCheck(words: string, texts: { teamText: string; ownerText: string }): GuardOutcome {
  const teamHolds = holds(
    looseAmountsIn(texts.teamText).map((one) => one.paise),
    percentsIn(texts.teamText).map((one) => one.value),
  );
  const given = discountsGivenIn(`${texts.ownerText}\n${texts.teamText}`);
  const givenAsDiscount = holds(given.amountsPaise, given.percents);
  const found: string[] = [];
  for (const sentence of sentencesOf(withAsciiDigits(words))) {
    const claim = claimIn(sentence, teamClaimPhrases);
    if (claim === null) continue;
    const detail = words.slice(claim.start, claim.end);
    if (texts.teamText.trim() === "") return { passed: false, detail, retry: NO_TEAM_LINE };
    const unsaid = figuresIn(sentence.text).find((figure) => !teamHolds(figure));
    if (unsaid !== undefined) {
      const retry = `The Team lines don't say ${figureWords(unsaid)}: quote the team's own figure, or leave it out.`;
      return { passed: false, detail, retry };
    }
    found.push(detail);
  }
  for (const figure of replyDiscountsIn(words)) {
    const detail = `${figureWords(figure)} off`;
    if (!givenAsDiscount(figure)) {
      const retry = `No owner or Team text gives ${detail}: leave the discount out; if they ask for one, hand_over(discount).`;
      return { passed: false, detail, retry };
    }
    found.push(detail);
  }
  return found.length === 0 ? null : { passed: true, detail: found.join("; ") };
}
