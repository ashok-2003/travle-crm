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

/** Whether the agency's message asks about booking (book, booking, reserve, confirm your seats; Hinglish book karein/karu). */
export const asksToBook = (text: string): boolean =>
  /\b(book\w*|reserve\w*|confirm your seats?)\b|बुक/u.test(normalised(text));
