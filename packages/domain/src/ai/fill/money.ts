// A budget in words ("1 lakh", "50k", "1.5L", "2 crore", "₹80,000", "ek lakh") as paise, by code (design 2). The model returns
// what was said; a number it can't read is null and the fill asks. A budget is what the customer said, so it may be filled
// (a quote line's price may not).
import { MAX_BUDGET_PAISE } from "@travel-crm/contracts/crm";

const UNITS: [string, number][] = [
  ["(?:crore|cr|karod)", 10_000_000],
  ["(?:lakhs?|lacs?|l)", 100_000],
  ["(?:thousand|hazaa?r|k)", 1000],
];
const WORD_NUMBERS: Record<string, number> = {
  ek: 1,
  one: 1,
  do: 2,
  two: 2,
  teen: 3,
  three: 3,
  char: 4,
  four: 4,
  paanch: 5,
  panch: 5,
  five: 5,
};

/** Paise, or null when the words hold no usable amount. */
export function paiseFromSpoken(spoken: string | number): number | null {
  if (typeof spoken === "number") return Number.isFinite(spoken) ? toPaise(spoken) : null;
  let text = spoken
    .toLowerCase()
    .replace(/[₹,]/g, "")
    .replace(/\b(rs|inr|rupees?|rupaye)\b\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  for (const [word, value] of Object.entries(WORD_NUMBERS))
    text = text.replace(new RegExp(`^${word}\\b`), String(value));
  // "1 lakh", "1.5 lakh", "1.5l", "50k", "2cr": a number then a unit.
  for (const [unit, size] of UNITS) {
    const match = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}\\b`).exec(text);
    if (match) return toPaise(Number(match[1]) * size);
  }
  const plain = /^(\d+(?:\.\d+)?)(?:\s|$)/.exec(text);
  return plain ? toPaise(Number(plain[1])) : null;
}

function toPaise(rupees: number): number | null {
  const paise = Math.round(rupees * 100);
  return paise >= 1 && paise <= MAX_BUDGET_PAISE ? paise : null;
}
