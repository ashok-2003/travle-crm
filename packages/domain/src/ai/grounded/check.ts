// The last gate before a written reply reaches a customer: refuses an amount or date code didn't write, a place the turn doesn't sell, and a claim of payment or of the team's word.
import {
  amountsAndDatesIn,
  customTripPhrases,
  indianTravelPlaces,
  notRunPhrases,
  paymentClaimPhrases,
  teamClaimPhrases,
} from "@travel-crm/contracts/ai";
import { clausesOf, findPhrases, findWord, hasPhrase, sentencesOf, type Found } from "./phrase-match.js";

export type ReplyRefusal = "amount" | "date" | "place" | "payment_claim" | "team_claim";
export type ReplyCheck = { ok: true } | { ok: false; reason: ReplyRefusal; excerpt: string };

export interface ReplyContext {
  packagePlaces: string[];
  notRun: string[];
  customTrips: boolean;
  knownPlaces: string[];
}

const MAX_EXCERPT = 80;
// What can govern an English claim: a condition before it in its clause, a negation on it, or a modal before its verb.
const CONDITION = /\b(?:once|after|when|whenever|as soon as|if|until|till)\b/i;
const NEGATION = /n't\b|\b(?:not|never|no|yet to|cannot)\b/i;
const MODAL = /\b(?:will|shall|would|can|may|to be|get|gets|getting)\b/i;
// "To get your booking confirmed": a bare noun-participle after a verb that asks for it is a wish, not news.
const BARE_BOOKING = /^(?:booking|seats?|trip|slot|tour)(?:['’]s)?\s+\S+$/i;
const CAUSATIVE = /\b(?:to|get|gets|getting|have|has|having|want|wants|need|needs|help)\b/i;
const NON_ENGLISH =
  /[\u0900-\u097F]|\b(?:gaya|gayi|gaye|gya|mila|mili|bataya|kaha|bola|diya|bheja|hui|karte|karate|liya)\b/i;

const excerptOf = (text: string, { start, end }: Found): string => {
  if (end - start >= MAX_EXCERPT) return text.slice(start, start + MAX_EXCERPT);
  const spare = MAX_EXCERPT - (end - start);
  const from = Math.max(0, start - Math.floor(spare / 2));
  return text.slice(from, Math.min(text.length, end + (MAX_EXCERPT - (end - from)))).trim();
};

/** The first claim in a sentence, clause by clause; an English one is excused only by a hedge that governs it. */
function claimIn(sentence: { text: string; start: number }, phrases: readonly string[]): Found | null {
  const isQuestion = sentence.text.trimEnd().endsWith("?");
  const clauses = clausesOf(sentence.text);
  for (const [index, clause] of clauses.entries()) {
    for (const found of findPhrases(clause.text, phrases)) {
      const matched = clause.text.slice(found.start, found.end);
      const before = clause.text.slice(0, found.start);
      const wordsBefore = (count: number) => before.split(/\s+/).slice(-count).join(" ");
      const hedged =
        (isQuestion && index === clauses.length - 1) ||
        CONDITION.test(`${before} ${matched}`) ||
        NEGATION.test(`${wordsBefore(3)} ${matched}`) ||
        MODAL.test(`${wordsBefore(2)} ${matched}`) ||
        (BARE_BOOKING.test(matched) && CAUSATIVE.test(wordsBefore(4)));
      if (hedged && !NON_ENGLISH.test(matched)) continue;
      const start = sentence.start + clause.start + found.start;
      return { start, end: start + (found.end - found.start) };
    }
  }
  return null;
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
