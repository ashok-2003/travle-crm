// Word-level helpers for judging the customer's words: normalising, splitting into words and whole-word matching.

/** Lowercase, single spaces, no punctuation (Unicode-aware, so Devanagari letters and marks stay). */
export function normalised(text: string): string {
  return text.toLowerCase().replace(/\p{P}/gu, " ").replace(/\s+/gu, " ").trim();
}

export const wordsOf = (text: string): string[] =>
  normalised(text)
    .split(" ")
    .filter((word) => word !== "");

/** Whether `needle` sits in `haystack` on word boundaries (both are normalised first). */
export function containsWords(haystack: string, needle: string): boolean {
  const wanted = normalised(needle);
  return wanted !== "" && ` ${normalised(haystack)} `.includes(` ${wanted} `);
}
