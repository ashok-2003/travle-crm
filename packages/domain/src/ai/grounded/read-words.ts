// Word-level helpers for judging evidence: normalising, whole-word matching, number words, and bare affirmations.

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

const numberWords = new Set(
  (
    "one two three four five six seven eight nine ten " +
    "ek do teen char paanch panch chhe che saat aath nau das " +
    "एक दो तीन चार पाँच पांच छह छः सात आठ नौ दस"
  ).split(" "),
);
const roomWords = new Set(["single", "double", "triple", "quad", "twin", "solo", "couple"]);

/** A digit or a number word (English, Hinglish, Hindi: one to ten) in the evidence. */
export function hasANumber(evidence: string): boolean {
  return /\p{N}/u.test(evidence) || wordsOf(evidence).some((word) => numberWords.has(word));
}

/** For a room, its type word says one room. */
export const hasARoomCount = (evidence: string): boolean =>
  hasANumber(evidence) || wordsOf(evidence).some((word) => roomWords.has(word));

const monthNames =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/u;
export const hasAMonth = (evidence: string): boolean =>
  /\p{N}/u.test(evidence) || monthNames.test(normalised(evidence));

const affirmations = new Set("yes ok okay haan ha ji sure done yep yeah 👍 हाँ हां जी ठीक".split(" "));
/** Evidence made only of yes, ok, haan... says nothing alone: it answers a question. */
export const isAffirmation = (evidence: string): boolean =>
  wordsOf(evidence).length > 0 && wordsOf(evidence).every((word) => affirmations.has(word));

/** Words that make an evidence a wish to book or to pay by themselves. */
const wishCues =
  /\b(book\w*|reserve\w*|confirm\w*|pay\w*|paid|advance|transfer\w*|send|sent|proceed|lock|karo|kar do|kar diya|bhej\w*|mil gaya|le lenge|lena hai|go ahead|take it)\b|बुक|पेमेंट|पैसे|भुगतान|कन्फर्म/u;
export const hasAWishCue = (evidence: string): boolean => wishCues.test(normalised(evidence));

/** Whether the agency's message asks about booking (book, booking, reserve, confirm your seats; Hinglish book karein/karu). */
export const asksToBook = (text: string): boolean =>
  /\b(book\w*|reserve\w*|confirm your seats?)\b|बुक/u.test(normalised(text));
