// The write-up's words are the model's, its numbers are not: the model writes {total}, {advance} and {link}, plain code puts
// the quote's own values there, and an amount the model typed itself (a ₹ or Rs figure) is taken out and flagged.

/** ₹ 1,20,000 · Rs. 5000/- · INR 5,000 · 5000 rupees: a figure the model typed with a currency next to it. */
const AMOUNT =
  /(?:₹|\bRs\.?|\bINR)\s*\d[\d,.]*(?:\s*\/-)?|\b\d[\d,.]*\s*(?:rupees|rupaye|रुपये|रुपए)\b|\d[\d,.]*\s*\/-/giu;

export interface WriteUpValues {
  /** Already formatted, e.g. "₹1,20,000.00". */
  total: string;
  /** The first payment due, formatted; null when the quote has no schedule. */
  advance: string | null;
  /** False for a draft quote, which has no link: the line holding {link} is dropped. Else the token stays for the screen to fill. */
  hasLink: boolean;
}

/** Takes out the amounts the model typed. Whether any was removed says the writing slipped. */
export function withoutTypedAmounts(text: string): { text: string; removed: boolean } {
  // Only the model's own words are cleaned, before the tokens are filled with the quote's values.
  const removed = new RegExp(AMOUNT.source, AMOUNT.flags).test(text);
  if (!removed) return { text, removed };
  const cleaned = text.replace(AMOUNT, "");
  return { text: cleaned.replace(/[ \t]{2,}/g, " ").replace(/ +([.,!])/g, "$1"), removed };
}

/** Fills {total} and {advance} from the quote; a line whose value the quote doesn't have is dropped. */
export function fillTokens(text: string, values: WriteUpValues): string {
  const lines = text
    .split("\n")
    .filter((line) => !(values.advance === null && line.includes("{advance}")))
    .filter((line) => !(!values.hasLink && line.includes("{link}")))
    .map((line) => line.replaceAll("{total}", values.total).replaceAll("{advance}", values.advance ?? ""));
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
