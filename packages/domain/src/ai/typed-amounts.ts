// A model's own words are never trusted with a price: an amount it typed (a ₹ or Rs figure) is taken out and flagged.

/** ₹ 1,20,000 · Rs. 5000/- · INR 5,000 · 5000 rupees: a figure the model typed with a currency next to it. */
const AMOUNT =
  /(?:₹|\bRs\.?|\bINR)\s*\d[\d,.]*(?:\s*\/-)?|\b\d[\d,.]*\s*(?:rupees|rupaye|रुपये|रुपए)\b|\d[\d,.]*\s*\/-/giu;

/** Takes out the amounts the model typed. Whether any was removed says the writing slipped. */
export function withoutTypedAmounts(text: string): { text: string; removed: boolean } {
  const removed = new RegExp(AMOUNT.source, AMOUNT.flags).test(text);
  if (!removed) return { text, removed };
  const cleaned = text.replace(AMOUNT, "");
  return { text: cleaned.replace(/[ \t]{2,}/g, " ").replace(/ +([.,!])/g, "$1"), removed };
}
