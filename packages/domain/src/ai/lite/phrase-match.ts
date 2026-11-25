// Phrases as regular expressions on word boundaries, case-insensitively, and a text's sentences with where each starts.
const WORD_EDGE_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const WORD_EDGE_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
const AMOUNT =
  "(?:(?:₹|rs\\.?|inr)\\s*\\d[\\d,.]*|\\d[\\d,]*\\s*(?:k|/-|rupees|rs)(?![\\p{L}\\p{N}])|\\d{4,}|\\d{1,3}(?:,\\d{2,3})+)";
const GROUPS: Record<string, string> = {
  "{pay}": "(?:payments?|advance|amount|money|balance|transfer|deposit|upi|funds?|token)",
  "{got}": "(?:received|receive[sd]?|got|reached|credited|arrived|came\\s+through)",
  "{bk}": "(?:booking|seats?|trip|slot|tour)(?:['’]s)?",
  "{be}": "(?:is|are|was|were|has\\s+been|have\\s+been|been)(?:\\s+now)?",
  "{done}": "(?:confirmed|booked|reserved|locked|done)",
};
const ANY_WORDS = "(?:\\S+\\s+){0,4}?";

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "hum … nahi karate" -> a pattern; "{pay}", "{got}", "{bk}", "{done}" are word groups, "…" is up to four words, "{amount}" a money amount, a leading "^" the sentence start. */
export function phraseRegex(phrase: string, flags = "iu"): RegExp {
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
  return new RegExp(`${front}${source}${WORD_EDGE_AFTER}`, flags);
}

export interface Found {
  start: number;
  end: number;
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
