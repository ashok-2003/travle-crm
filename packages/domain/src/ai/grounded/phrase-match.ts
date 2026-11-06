// Finds words and phrases in a reply on word boundaries, case-insensitively, for the reply check.
const WORD_EDGE_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const WORD_EDGE_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
const AMOUNT =
  "(?:(?:₹|rs\\.?|inr)\\s*\\d[\\d,.]*|\\d[\\d,]*\\s*(?:k|/-|rupees|rs)(?![\\p{L}\\p{N}])|\\d{4,}|\\d{1,3}(?:,\\d{2,3})+)";
const GROUPS: Record<string, string> = {
  "{pay}": "(?:payments?|advance|amount|money|balance|transfer|deposit|upi|funds?|token)",
  "{got}": "(?:received|receive[sd]?|got|reached|credited|arrived|came\\s+through)",
  "{bk}": "(?:booking|seats?|trip|slot|tour)",
  "{done}": "(?:confirmed|booked|reserved|locked|done)",
};
const ANY_WORDS = "(?:\\S+\\s+){0,4}?";

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "hum … nahi karate" -> a pattern; "{pay}", "{got}", "{bk}", "{done}" are word groups, "…" is up to four words, "{amount}" a money amount, a leading "^" the sentence start. */
export function phraseRegex(phrase: string): RegExp {
  const anchored = phrase.startsWith("^");
  const tokens = phrase.replace(/^\^/, "").split(" ");
  let source = "";
  tokens.forEach((token, index) => {
    if (token === "…") {
      source += ANY_WORDS;
      return;
    }
    source += token === "{amount}" ? AMOUNT : (GROUPS[token] ?? escape(token));
    if (index < tokens.length - 1) source += "\\s+";
  });
  const front = anchored ? "^\\s*" : WORD_EDGE_BEFORE;
  return new RegExp(`${front}${source}${WORD_EDGE_AFTER}`, "iu");
}

export interface Found {
  start: number;
  end: number;
}

/** The first place in `text` where any phrase of the list appears. */
export function findPhrase(text: string, phrases: readonly string[]): Found | null {
  let best: Found | null = null;
  for (const phrase of phrases) {
    const match = phraseRegex(phrase).exec(text);
    if (match && (!best || match.index < best.start)) best = { start: match.index, end: match.index + match[0].length };
  }
  return best;
}

export const hasPhrase = (text: string, phrases: readonly string[]): boolean => findPhrase(text, phrases) !== null;

/** Every whole-word, case-insensitive appearance of a name (a multi-word place counts as a whole). */
export function findWord(text: string, word: string): Found[] {
  const pattern = new RegExp(
    `${WORD_EDGE_BEFORE}${word.trim().split(/\s+/).map(escape).join("\\s+")}${WORD_EDGE_AFTER}`,
    "giu",
  );
  return [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/** Sentences split on . ! ? newlines and the danda, with their positions; a dot inside "7.5k" or "Rs. 5" does not split. */
export function sentencesOf(text: string): { text: string; start: number }[] {
  const sentences: { text: string; start: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(/[!?।\n]+|\.(?=\s|$)/g)) {
    sentences.push({ text: text.slice(start, m.index + m[0].length), start });
    start = m.index + m[0].length;
  }
  if (start < text.length) sentences.push({ text: text.slice(start), start });
  return sentences.filter((s) => s.text.trim() !== "");
}

/** The parts of a sentence that hold one claim each: split on commas, semicolons, dashes, "and" and "but". */
export function clausesOf(sentence: string): { text: string; start: number }[] {
  const clauses: { text: string; start: number }[] = [];
  let start = 0;
  for (const m of sentence.matchAll(/[,;—–]|\s(?:and|but)\s/gi)) {
    clauses.push({ text: sentence.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  clauses.push({ text: sentence.slice(start), start });
  return clauses.filter((c) => c.text.trim() !== "");
}
