// Fractions of money: percentages, shares and splits, with the rounding stated by the caller. BigInt inside, so
// products of large amounts and rates stay exact until the one rounding step.
import { money, type Money } from "./money.js";

/** How a result between two paise is rounded. "half-up" rounds a half away from zero; "half-even" to the even paisa. */
export type Rounding = "half-up" | "half-even";

function wholeNumber(value: number, what: string): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be a whole number, got ${String(value)}`);
  return BigInt(value);
}

/** numerator / denominator (denominator > 0), rounded once. */
function divide(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  const twiceRemainder = (magnitude % denominator) * 2n;
  const roundsUp =
    twiceRemainder > denominator ||
    (twiceRemainder === denominator && (rounding === "half-up" || quotient % 2n === 1n));
  if (roundsUp) quotient += 1n;
  return negative ? -quotient : quotient;
}

function toMoney(paise: bigint, like: Money): Money {
  if (paise > BigInt(Number.MAX_SAFE_INTEGER) || paise < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("The result is too large to hold exactly");
  }
  return money(Number(paise), like.currency);
}

/** amount × numerator ÷ denominator, rounded once: fractionOf(price, 1, 3) is a third of the price. */
export function fractionOf(
  amount: Money,
  numerator: number,
  denominator: number,
  rounding: Rounding = "half-up",
): Money {
  const divisor = wholeNumber(denominator, "A denominator");
  if (divisor <= 0n) throw new RangeError("A denominator must be positive");
  return toMoney(divide(BigInt(amount.amountPaise) * wholeNumber(numerator, "A numerator"), divisor, rounding), amount);
}

/** A percentage given in basis points (1800 is 18 %), rounded once to the paisa. */
export function percentageOf(amount: Money, basisPoints: number, rounding: Rounding = "half-up"): Money {
  return fractionOf(amount, basisPoints, 10_000, rounding);
}

/**
 * Splits an amount in proportion to whole-number ratios without losing a paisa: each part is rounded down and the
 * paise left over go one each to the parts with the largest fractions (ties to the earlier part), so no part is
 * more than a paisa from its exact share. allocate(₹100, [1, 1, 1]) is ₹33.34, ₹33.33, ₹33.33.
 */
export function allocate(amount: Money, ratios: readonly number[]): Money[] {
  const weights = ratios.map((ratio) => wholeNumber(ratio, "A ratio"));
  if (weights.some((weight) => weight < 0n)) throw new RangeError("Ratios can't be negative");
  const totalWeight = weights.reduce((total, weight) => total + weight, 0n);
  if (totalWeight === 0n) throw new RangeError("Give at least one ratio above zero");
  const negative = amount.amountPaise < 0;
  const magnitude = BigInt(Math.abs(amount.amountPaise));
  const shares = weights.map((weight) => (magnitude * weight) / totalWeight);
  const remainders = weights.map((weight) => (magnitude * weight) % totalWeight);
  const left = Number(magnitude - shares.reduce((total, share) => total + share, 0n));
  // Parts with a zero ratio have a zero remainder and there are never more leftover paise than parts with a
  // remainder, so they get nothing.
  const byRemainder = weights
    .map((_, index) => index)
    .sort((a, b) => {
      const difference = (remainders[b] ?? 0n) - (remainders[a] ?? 0n);
      return difference > 0n ? 1 : difference < 0n ? -1 : a - b;
    });
  for (const index of byRemainder.slice(0, left)) shares[index] = (shares[index] ?? 0n) + 1n;
  return shares.map((share) => toMoney(negative ? -share : share, amount));
}
