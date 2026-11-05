// A rate sheet's printed price as paise, by code (design 3.2): the model copies what is printed ("₹4,500", "4500/-", "4.5k",
// "1.2 lakh"); this makes it a whole number of paise, or null when it is not exactly one price (a range, "on request", "-", a
// number with odd grouping). A null is a question on the screen, never a guess. The tax words printed beside a price are
// found here too: they are kept as a note, and no tax is ever added or removed.
import { MAX_RATE_PAISE } from "@travel-crm/contracts/suppliers";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";

const MULTIPLIERS: [RegExp, number][] = [
  [/^(\d+(?:\.\d+)?)\s*(?:crore|cr)$/, 10_000_000],
  [/^(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|l)$/, 100_000],
  [/^(\d+(?:\.\d+)?)\s*k$/, 1000],
];

/** The currency words and marks, and the "/-" and "only" that decorate a price, taken off. */
function stripped(printed: string): string {
  return printed
    .toLowerCase()
    .replace(/₹/g, " ")
    .replace(/\b(?:rs|inr|rupees?)\b\.?/g, " ")
    .replace(/\/-|\bonly\b/g, " ")
    .replace(/\+\s*(?:gst|tax(?:es)?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const acceptable = (paise: number | null) => (paise === null || paise < 1 || paise > MAX_RATE_PAISE ? null : paise);

/** Paise for a price printed as one amount; null for anything else, a range and zero included. */
export function parsePrintedPrice(printed: string): number | null {
  const text = stripped(printed);
  if (text === "" || text.length > 30) return null;
  for (const [pattern, size] of MULTIPLIERS) {
    const match = pattern.exec(text);
    if (match === null) continue;
    // Exact in whole rupees, or not a price: "4.5k" is 4,500 and "4.5555k" is a question.
    const [whole = "0", fraction = ""] = (match[1] ?? "").split(".");
    const scaled = BigInt(`${whole}${fraction}`) * BigInt(size);
    const divisor = 10n ** BigInt(fraction.length);
    if (scaled % divisor !== 0n) return null;
    return acceptable(paiseFromRupeesText(String(scaled / divisor)));
  }
  return acceptable(paiseFromRupeesText(text.replace(/\s/g, "")));
}

/** The numbers a line of the sheet holds, as digits with their grouping commas taken out ("4,500.00" is "4500.00"). */
export function numbersIn(line: string): Set<string> {
  const found = new Set<string>();
  for (const match of line.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const number = match[0].replace(/,+$/, "").replaceAll(",", "");
    found.add(number);
    // "4500.00" is the same price as "4500".
    if (number.includes(".")) found.add(number.replace(/\.?0+$/, ""));
  }
  return found;
}

/** The digits of a printed price as they would appear in the sheet ("4.5k" is 4.5, "₹4,500/-" is 4500). */
export function printedNumber(printed: string): string | null {
  const match = /\d[\d,]*(?:\.\d+)?/.exec(printed);
  return match === null ? null : match[0].replace(/,+$/, "").replaceAll(",", "");
}

/** Whether the number the model says is printed is in the line it names. */
export function priceInLine(printed: string, line: string): boolean {
  const number = printedNumber(printed);
  return number !== null && numbersIn(line).has(number);
}

/** Every amount a line prints, in paise, read the way a printed price is ("₹6,999" and "6k" are amounts; the 7 of "7N" is 7 rupees). */
export function amountsIn(line: string): Set<number> {
  const found = new Set<number>();
  for (const match of line.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*(crore|cr|lakhs?|lacs?|l|k)\b)?/gi)) {
    const paise = parsePrintedPrice(`${match[1] ?? ""}${match[2] ?? ""}`);
    if (paise !== null) found.add(paise);
  }
  return found;
}

/** Whether a line prints exactly this price: its amount, not just digits it starts with. */
export const amountInLine = (paise: number, line: string): boolean => amountsIn(line).has(paise);

const TAX_WORDS =
  /\+\s*gst|plus\s+(?:gst|taxes|tax)|\bgst\b|\btaxes?\b|\binclusive\b|\bexclusive\b|\bincl\.?|\bexcl\.?/gi;

/** The tax words printed in a line or beside a price, in the order found, once each. */
export function taxWordsIn(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts)
    for (const match of text.matchAll(TAX_WORDS)) found.add(match[0].replace(/\s+/g, " ").trim());
  return [...found];
}
