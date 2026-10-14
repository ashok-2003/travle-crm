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
 * A count or quantity in Indian grouping. Whole numbers unless fractionDigits is given, which rounds half away from
 * zero; money goes through formatMoney instead, which never rounds. Numbers beyond the safe integers are refused.
 */
export function formatIndianNumber(value: number | bigint, options: { fractionDigits?: number } = {}): string {
  const fractionDigits = options.fractionDigits ?? 0;
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 20) {
    throw new RangeError(`fractionDigits must be a whole number from 0 to 20, got ${String(fractionDigits)}`);
  }
  if (typeof value === "bigint") {
    const fraction = fractionDigits > 0 ? `.${"0".repeat(fractionDigits)}` : "";
    return `${value < 0n ? "-" : ""}${groupDigits((value < 0n ? -value : value).toString())}${fraction}`;
  }
  // Round the displayed value to whole units of the last digit shown, so everything after this is integer text.
  const scaled = Math.round(Math.abs(value) * 10 ** fractionDigits);
  if (!Number.isFinite(value) || !Number.isSafeInteger(scaled)) {
    throw new RangeError(`Can't show ${String(value)} exactly with ${String(fractionDigits)} fraction digits`);
  }
  if (fractionDigits === 0 && !Number.isSafeInteger(value)) {
    throw new RangeError(`Can't show ${String(value)} as a whole number`);
  }
  const digits = scaled.toString().padStart(fractionDigits + 1, "0");
  const whole = fractionDigits > 0 ? digits.slice(0, -fractionDigits) : digits;
  const fraction = fractionDigits > 0 ? `.${digits.slice(-fractionDigits)}` : "";
  return `${value < 0 && scaled > 0 ? "-" : ""}${groupDigits(whole)}${fraction}`;
}

/** "₹12,50,000.00", "-₹500.00", or without the symbol "12,50,000.00". */
export function formatMoney(amount: Money, options: { symbol?: boolean } = {}): string {
  const magnitude = BigInt(Math.abs(amount.amountPaise));
  const rupees = groupDigits((magnitude / 100n).toString());
  const paise = (magnitude % 100n).toString().padStart(2, "0");
  const symbol = options.symbol === false ? "" : currencySymbols[amount.currency];
  return `${amount.amountPaise < 0 ? "-" : ""}${symbol}${rupees}.${paise}`;
}
