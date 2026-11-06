// The last gate before a written reply reaches a customer: refuses an amount or date code didn't write, a place the turn doesn't sell, and a claim of payment or of the team's word.
import {
  amountsAndDatesIn,
  customTripPhrases,
  indianTravelPlaces,
  notRunPhrases,
  paymentClaimPhrases,
  teamClaimPhrases,
} from "@travel-crm/contracts/ai";
import { findPhrase, findWord, hasPhrase, sentencesOf, type Found } from "./phrase-match.js";

export type ReplyRefusal = "amount" | "date" | "place" | "payment_claim" | "team_claim";
export type ReplyCheck = { ok: true } | { ok: false; reason: ReplyRefusal; excerpt: string };

export interface ReplyContext {
  packagePlaces: string[];
  notRun: string[];
  customTrips: boolean;
  knownPlaces: string[];
}

const MAX_EXCERPT = 80;
// An English sentence that makes a payment or team phrase a condition, a denial or a question, not a claim.
const HEDGES =
  /\b(?:once|when|whenever|if|as soon as|after|until|till|before|get|getting|want|need|wanna|will|would|can|could|should|help|not|never|haven't|hasn't|didn't|yet to|n't)\b/i;
const NON_ENGLISH = /[ऀ-ॿ]|\b(?:gaya|gayi|gaye|gya|mila|mili|bataya|kaha|bola|diya|bheja|hui|karte|karate)\b/i;

const excerptOf = (text: string, { start, end }: Found): string => {
  if (end - start >= MAX_EXCERPT) return text.slice(start, start + MAX_EXCERPT);
  const spare = MAX_EXCERPT - (end - start);
  const from = Math.max(0, start - Math.floor(spare / 2));
  return text.slice(from, Math.min(text.length, end + (MAX_EXCERPT - (end - from)))).trim();
};

/** A phrase claim in a sentence, unless an English hedge sits within a few words before it or after it. */
function claimIn(sentence: { text: string; start: number }, phrases: readonly string[]): Found | null {
  const found = findPhrase(sentence.text, phrases);
  if (!found) return null;
  const matched = sentence.text.slice(found.start, found.end);
  if (!NON_ENGLISH.test(matched)) {
    if (sentence.text.trimEnd().endsWith("?")) return null;
    const near = [
      sentence.text.slice(0, found.start).split(/\s+/).slice(-5).join(" "),
      sentence.text.slice(found.end).split(/\s+/).slice(0, 4).join(" "),
    ].join(" ");
    if (HEDGES.test(near)) return null;
  }
  return { start: sentence.start + found.start, end: sentence.start + found.end };
}

const covers = (a: string, b: string): boolean => a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
const insideOne = (span: Found, filled: Found[]): boolean =>
  filled.some((f) => span.start >= f.start && span.end <= f.end);

function placeProblem(text: string, filled: Found[], context: ReplyContext): Found | null {
  const lower = (list: string[]) => list.map((place) => place.trim().toLowerCase()).filter(Boolean);
  const packagePlaces = lower(context.packagePlaces);
  const notRun = lower(context.notRun);
  const known = [...new Set([...lower(context.knownPlaces), ...indianTravelPlaces, ...packagePlaces, ...notRun])];
  const sentences = sentencesOf(text);
  for (const place of known) {
    for (const span of findWord(text, place)) {
      if (insideOne(span, filled) || packagePlaces.some((p) => covers(p, place))) continue;
      if (notRun.some((n) => covers(n, place))) {
        const sentence = sentences.find((s) => span.start >= s.start && span.start < s.start + s.text.length);
        const says = sentence?.text ?? text;
        if (hasPhrase(says, notRunPhrases) || (context.customTrips && hasPhrase(says, customTripPhrases))) continue;
      }
      return span;
    }
  }
  return null;
}

export function checkReply(text: string, filled: Found[], context: ReplyContext): ReplyCheck {
  const refuse = (reason: ReplyRefusal, span: Found): ReplyCheck => ({
    ok: false,
    reason,
    excerpt: excerptOf(text, span),
  });
  const sentences = sentencesOf(text);
  // Claims come first: "we received your ₹4,000" is a payment claim before it is a typed amount.
  for (const sentence of sentences) {
    const payment = claimIn(sentence, paymentClaimPhrases);
    if (payment) return refuse("payment_claim", payment);
  }
  for (const sentence of sentences) {
    const team = claimIn(sentence, teamClaimPhrases);
    if (team) return refuse("team_claim", team);
  }
  const typed = amountsAndDatesIn(text).find((span) => !insideOne(span, filled));
  if (typed) return refuse(typed.kind === "money" ? "amount" : "date", typed);
  const place = placeProblem(text, filled, context);
  return place ? refuse("place", place) : { ok: true };
}
