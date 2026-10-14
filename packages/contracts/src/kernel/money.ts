// Money as the API carries it (spec 9.6): integer paise and a currency code, never a float. Typed amounts are read
// into paise digit by digit.
import { z } from "zod";

/** The currencies the product handles. Phase 1 is India only; Phase 3 adds more. */
export const currencyCodes = ["INR"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];

/** An amount in the smallest unit (paise for rupees): a safe integer, so it is exact. */
export const moneyField = z.strictObject({ amountPaise: z.int(), currency: z.enum(currencyCodes) });
export type MoneyField = z.infer<typeof moneyField>;

/**
 * Whole rupees as people type them: plain digits, Indian grouping (12,50,000) or international grouping (1,250,000).
 * Two decimals at most.
 */
const RUPEES_PATTERN = /^(-)?(\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.(\d{1,2}))?$/;

/** A typed rupee amount such as "12,50,000.50", "₹999" or "-500", in paise; null when it isn't one or is too large. */
export function paiseFromRupeesText(text: string): number | null {
  const match = RUPEES_PATTERN.exec(text.trim().replace(/^(-?)\s*₹\s*/, "$1"));
  if (!match) return null;
  const [, minus, rupees = "", fraction = ""] = match;
  const paise = BigInt(rupees.replaceAll(",", "")) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = minus ? -paise : paise;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
}

/** A rupee amount typed into a form, read into paise. */
export const rupeesText = z
  .string()
  .max(40)
  .transform((text, context) => {
    const paise = paiseFromRupeesText(text);
    if (paise === null) {
      context.issues.push({ code: "custom", message: "Use an amount like 12,50,000.50", input: text });
      return z.NEVER;
    }
    return paise;
  });
