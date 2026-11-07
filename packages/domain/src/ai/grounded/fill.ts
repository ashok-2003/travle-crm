// Fills a written reply's placeholders ("[price P1 double]") from the card, and says which ones had no value.
import type { Card } from "./card.js";

/**
 * [words P<n> more]: words, then a package key, then optional words or a number. A room type has an underscore
 * ("child_bed"), and anything else after the key is still read, so a placeholder the card lacks is reported, never sent.
 */
const SHAPE = /\[\s*[A-Za-z_]+(?:\s+[A-Za-z_]+)*\s+[Pp]\d+(?:\s+[^\s[\]]+)*\s*\]/g;

/** A bracket that opens with one of the card's kinds but names no package ("[total]", "[price double]"): never sent as is. */
const KEYLESS = /\[\s*(?:price|from|total|departure|seats|advance|pickup)\b[^[\]]*\]/gi;

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
  output += text.slice(last);
  for (const match of output.matchAll(KEYLESS)) {
    const inside = filled.some(({ start, end }) => match.index >= start && match.index < end);
    if (!inside && !unknown.includes(match[0])) unknown.push(match[0]);
  }
  return { text: output, filled, unknown };
}
