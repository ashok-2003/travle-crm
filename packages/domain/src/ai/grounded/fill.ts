// Fills a written reply's placeholders ("[price P1 double]") from the card, and says which ones had no value.
import type { Card } from "./card.js";

/** [words P<n> more]: letters, then a package key, then optional words or a number. */
const SHAPE = /\[\s*[A-Za-z]+(?:\s+[A-Za-z]+)*\s+P\d+(?:\s+[A-Za-z0-9]+)*\s*\]/g;

/** The same placeholder however the model spaced or capitalised it: "[Price  P1 Double]" is "[price P1 double]". */
const canonical = (found: string): string => {
  const words = found
    .slice(1, -1)
    .trim()
    .split(/\s+/)
    .map((word) => (/^P\d+$/i.test(word) ? word.toUpperCase() : word.toLowerCase()));
  return `[${words.join(" ")}]`;
};

export interface Filled {
  text: string;
  /** Where code wrote, as positions in `text`, so the check can skip them. */
  filled: { start: number; end: number }[];
  /** Placeholders with no value; they stay in the text as they were. */
  unknown: string[];
}

export function fillPlaceholders(text: string, card: Card): Filled {
  let output = "";
  let last = 0;
  const filled: Filled["filled"] = [];
  const unknown: string[] = [];
  for (const match of text.matchAll(SHAPE)) {
    const value = card.values.get(canonical(match[0]));
    output += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (value === undefined) {
      output += match[0];
      if (!unknown.includes(match[0])) unknown.push(match[0]);
      continue;
    }
    filled.push({ start: output.length, end: output.length + value.length });
    output += value;
  }
  return { text: output + text.slice(last), filled, unknown };
}
