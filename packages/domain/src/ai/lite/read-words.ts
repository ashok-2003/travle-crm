// Word-level helpers for judging evidence: normalising, whole-word matching, bare affirmations and the wish to book.

/** Lowercase, single spaces, no punctuation (Unicode-aware, so Devanagari letters and marks stay). */
export function normalised(text: string): string {
  return text.toLowerCase().replace(/\p{P}/gu, " ").replace(/\s+/gu, " ").trim();
}

export const wordsOf = (text: string): string[] =>
  normalised(text)
    .split(" ")
    .filter((word) => word !== "");

/** At least one whole word: a token of two characters or more, or a lone number. */
export function hasAWord(text: string): boolean {
  return wordsOf(text).some((word) => Array.from(word).length >= 2 || /^\d$/u.test(word));
}

/** Whether `needle` sits in `haystack` on word boundaries (both are normalised first). */
export function containsWords(haystack: string, needle: string): boolean {
  const wanted = normalised(needle);
  return wanted !== "" && ` ${normalised(haystack)} `.includes(` ${wanted} `);
}

/** Whether any word of `text` is at least `length` characters and is one of the evidence's words. */
export function sharesAWord(evidence: string, text: string, length: number): boolean {
  const seen = new Set(wordsOf(evidence));
  return wordsOf(text).some((word) => Array.from(word).length >= length && seen.has(word));
}

const affirmations = new Set("yes ok okay haan ha ji sure done yep yeah 👍 हाँ हां जी ठीक".split(" "));
/** Evidence made only of yes, ok, haan... says nothing alone: it answers a question. */
export const isAffirmation = (evidence: string): boolean =>
  wordsOf(evidence).length > 0 && wordsOf(evidence).every((word) => affirmations.has(word));

/** Words that make an evidence a wish to book or to pay by themselves. */
const wishCues =
  // Never a bare "send" or "kar do": "send me the details" and "details share kar do" ask for information, not a booking.
  /\b(book\w*|reserve\w*|confirm\w*|pay\w*|paid|advance|transfer\w*|sent|proceed|lock|bhej diya|bhej diye|bhej di|mil gaya|le lenge|lena hai|go ahead|take it|final\w*|pakka|chalo|count me in|im in|i m in)\b|बुक|पेमेंट|पैसे|भुगतान|कन्फर्म|पक्का/u;
export const hasAWishCue = (evidence: string): boolean => wishCues.test(normalised(evidence));

/** The words that open a question: English, Hinglish and Hindi. */
const QUESTION_OPENER =
  /^(?:how|what|when|is|are|can|could|do|does|kya|kaise|kab|kitna|kitne|kitni|क्या|कैसे|कब|कितना|कितने|कितनी)$/u;

/** A message's sentences, split after . ! ? । and new lines. */
export const sentencesIn = (text: string): string[] =>
  text
    .split(/(?<=[.!?।\n])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");

/** Ends with "?" (an emoji or a space after it aside) or opens with a question word: "how do I book", "final price?". */
export function isAQuestion(sentence: string): boolean {
  const end = sentence.replace(/[^\p{L}\p{M}\p{N}?]+$/u, "");
  return end.endsWith("?") || QUESTION_OPENER.test(wordsOf(sentence)[0] ?? "");
}

/**
 * Whether the agency's message ends by asking about booking: its last sentence is a question that holds book, reserve
 * or "confirm your seats" ("Shall I book the 12 Dec departure?", "book karein?"). A mention of booking before a question
 * about something else ("Bookings close soon. Want the brochure?") is no such question.
 */
export function asksToBook(text: string): boolean {
  const end = text.replace(/[^\p{L}\p{M}\p{N}?]+$/u, "");
  if (!end.endsWith("?")) return false;
  return /\b(book\w*|reserve\w*|confirm your seats?)\b|बुक/u.test(normalised(sentencesIn(end).at(-1) ?? ""));
}
