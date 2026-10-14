// Numbers and money shown the Indian way (spec 9.6): the last three digits, then pairs, so ₹12,50,000.00 and
// 1,23,45,678. The same as Intl's en-IN format, written out so it works on bigints and exact paise.
import type { CurrencyCode } from "@travel-crm/contracts/kernel";
import type { Money } from "./money.js";

const currencySymbols: Record<CurrencyCode, string> = { INR: "₹" };

/** "1250000" → "12,50,000". */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const pairs = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${pairs},${digits.slice(-3)}`;
}

/**
 * A count or quantity in Indian grouping. Whole numbers unless fractionDigits is given; money goes through
 * formatMoney instead, which never rounds.
 */
export function formatIndianNumber(value: number | bigint, options: { fractionDigits?: number } = {}): string {
  const fractionDigits = options.fractionDigits ?? 0;
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || (fractionDigits === 0 && !Number.isSafeInteger(value)))
  ) {
    throw new RangeError(`Can't show ${String(value)} as a whole number`);
  }
  const text = typeof value === "bigint" ? value.toString() : value.toFixed(fractionDigits);
  const negative = text.startsWith("-");
  const [whole = "", fraction] = (negative ? text.slice(1) : text).split(".");
  const fractionPart =
    typeof value === "bigint" && fractionDigits > 0 ? `.${"0".repeat(fractionDigits)}` : fraction ? `.${fraction}` : "";
  return `${negative ? "-" : ""}${groupDigits(whole)}${fractionPart}`;
}

/** "₹12,50,000.00", "-₹500.00", or without the symbol "12,50,000.00". */
export function formatMoney(amount: Money, options: { symbol?: boolean } = {}): string {
  const magnitude = BigInt(Math.abs(amount.amountPaise));
  const rupees = groupDigits((magnitude / 100n).toString());
  const paise = (magnitude % 100n).toString().padStart(2, "0");
  const symbol = options.symbol === false ? "" : currencySymbols[amount.currency];
  return `${amount.amountPaise < 0 ? "-" : ""}${symbol}${rupees}.${paise}`;
}
