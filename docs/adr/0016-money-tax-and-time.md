# 0016: Money, tax and time in the shared kernel

Date: 2026-10-15 · Status: accepted · Implements spec section 9.6

## Decision

### Money

- **`Money` is integer paise plus a currency code**: `{ amountPaise, currency: "INR" }`, frozen. The amount is a
  JavaScript safe integer (up to about ₹90 lakh crore), so it is exact; anything else is refused with a `RangeError`.
  The API carries the same shape (`moneyField` in `@travel-crm/contracts/kernel`).
- **One place for arithmetic.** `add`, `subtract`, `multiply` (by whole quantities), `sum`, `compare` work on paise.
  Fractions (`percentageOf` in basis points, `fractionOf`, `allocate`) compute in BigInt and round once, at the end,
  with the rounding the caller names: `half-up` (a half rounds away from zero, the default) or `half-even`.
  `allocate` splits without losing a paisa and gives the leftover paise to the first parts.
- **Typed amounts never pass through a float.** `parseRupees("12,50,000.50")` (and the `rupeesText` contract) read
  digits: plain, Indian grouping or international grouping, two decimals at most.
- **Indian format.** `formatMoney` gives `₹12,50,000.00` and `formatIndianNumber` `1,23,45,678`: the last three
  digits, then pairs, exactly as `Intl.NumberFormat("en-IN")` does (a test compares them), but on exact paise and
  bigints.

## Context

- Floats can't hold most paise amounts exactly (₹0.10 + ₹0.20 is not ₹0.30), and a GST invoice that is a paisa off
  is wrong. Integers of the smallest unit are the usual answer; safe integers keep `JSON` and Postgres `bigint` simple.
- `CurrencyCode` is only `"INR"` in Phase 1. Phase 3 widens it; the currency checks are already written as string
  comparisons so they work then.

## Consequences

- Database columns for money are `bigint` (or `integer` where amounts are small) holding paise, never `numeric` read
  into floats.
- Rounding is visible at every call site that divides money, so reviewers can check it against the rule that
  applies (GST rounds each line half-up).
