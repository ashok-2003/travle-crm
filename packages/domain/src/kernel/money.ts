// Money (spec 9.6): integer paise plus a currency code. All arithmetic and rounding live in the kernel, so no module
// ever computes with a float.
import { paiseFromRupeesText, type CurrencyCode } from "@travel-crm/contracts/kernel";

export type { CurrencyCode } from "@travel-crm/contracts/kernel";

/** An exact amount: a safe integer number of paise (or the currency's smallest unit). */
export interface Money {
  readonly amountPaise: number;
  readonly currency: CurrencyCode;
}

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${what} must be a whole number within ±${String(Number.MAX_SAFE_INTEGER)}, got ${String(value)}`,
    );
  }
}

/** Builds an amount from whole paise: money(125_000_050) is ₹12,50,000.50. */
export function money(amountPaise: number, currency: CurrencyCode = "INR"): Money {
  assertSafeInteger(amountPaise, "An amount in paise");
  return Object.freeze({ amountPaise, currency });
}

/** Reads a typed amount such as "12,50,000.50" or "₹999" without going through a float. */
export function parseRupees(text: string): Money {
  const paise = paiseFromRupeesText(text);
  if (paise === null) throw new RangeError(`Not a rupee amount: ${JSON.stringify(text.slice(0, 40))}`);
  return money(paise, "INR");
}

function sameCurrency(a: Money, b: Money): CurrencyCode {
  // Only rupees exist today, so the types can't tell the currencies apart; compared as strings, the check is ready
  // for Phase 3 and catches values cast from outside.
  const [left, right]: string[] = [a.currency, b.currency];
  if (left !== right) throw new TypeError(`Can't mix currencies: ${String(left)} and ${String(right)}`);
  return a.currency;
}

// Sums and products of safe integers are exact whenever the result is a safe integer, and money() refuses the rest.
export function add(a: Money, b: Money): Money {
  return money(a.amountPaise + b.amountPaise, sameCurrency(a, b));
}

export function subtract(a: Money, b: Money): Money {
  return money(a.amountPaise - b.amountPaise, sameCurrency(a, b));
}

export function negate(amount: Money): Money {
  return money(-amount.amountPaise, amount.currency);
}

/** The amount times a whole quantity, e.g. a price for 3 travellers. */
export function multiply(amount: Money, quantity: number): Money {
  assertSafeInteger(quantity, "A quantity");
  return money(amount.amountPaise * quantity, amount.currency);
}

/** The total of a list of amounts in one currency; an empty list is zero rupees. */
export function sum(amounts: readonly Money[], currency: CurrencyCode = "INR"): Money {
  return amounts.reduce((total, amount) => add(total, amount), money(0, amounts[0]?.currency ?? currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amountPaise < b.amountPaise ? -1 : a.amountPaise > b.amountPaise ? 1 : 0;
}

export function isZero(amount: Money): boolean {
  return amount.amountPaise === 0;
}
