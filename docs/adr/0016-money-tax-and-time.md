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
  `allocate` splits without losing a paisa and gives the leftover paise to the parts with the largest fractions
  (ties to the earlier part), so no part is more than a paisa from its exact share.
- **Typed amounts never pass through a float.** `parseRupees("12,50,000.50")` (and the `rupeesText` contract) read
  digits: plain, Indian grouping or international grouping, two decimals at most.
- **Indian format.** `formatMoney` gives `₹12,50,000.00` and `formatIndianNumber` `1,23,45,678`: the last three
  digits, then pairs, exactly as `Intl.NumberFormat("en-IN")` does (a test compares them), but on exact paise and
  bigints.

### Tax

- **`TaxEngine<Input, Breakdown>`** is the interface: lines in, per-line and total taxes out, each tax a named
  component with its rate and amount. Phase 1 implements `indiaGst`; other countries come in Phase 3 behind it.
- **India GST.** When the place of supply is the supplier's state: CGST and SGST, half the rate each, or CGST and
  UTGST in a union territory without a legislature (Chandigarh, Dadra and Nagar Haveli and Daman and Diu,
  Lakshadweep, Andaman and Nicobar, Ladakh, Other Territory). Between states, and for a place of supply outside
  India: IGST at the full rate.
- **Per line, half-up, each half on its own.** Each line's tax is rounded half-up to the paisa, and CGST and its
  partner are each computed and rounded separately, so they are always equal (₹100.10 at 5 %: ₹2.50 + ₹2.50 within a
  state, ₹5.01 between states). Totals add up the lines, grouped by tax and rate for the invoice's summary.
- **The caller decides the place of supply and the rate.** The engine has no place-of-supply rules (for tour
  operators they depend on the recipient's registration and the trip: the accounts module's job, step 6) and no list
  of slabs (GST 2.0 moved most rates to 5 %, 18 % and 40 % on 22 September 2025; rates are data per item). It checks
  that a rate is whole basis points from 0 to 10000 and a SAC code six digits starting 99. Export zero-rating under a
  Letter of Undertaking is also the accounts module's decision: the engine computes IGST at the rate it is given.
- **Special economic zones and supplies without payment of tax.** A supply to or by an SEZ unit or developer is
  inter-state (IGST) even within one state (IGST Act s.7(5)(b) and the proviso to s.8(2)); the caller says so with
  `specialEconomicZone`. `withoutPayment` is for zero-rated supplies under a Letter of Undertaking or bond, allowed
  only for an SEZ supply or a place of supply outside India: IGST keeps the item's rate with ₹0 tax, as GSTR-1 and
  e-invoices report it. The supply type for a place outside India is `outside-india`, not "export": whether it is an
  export of services (s.2(6)) is the caller's decision.
- **Limits.** `rateBasisPoints` is required, so a fixed-amount tax (such as a per-night tourist tax) needs an
  extension of the engine. A six-digit SAC is required (Notification 78/2020-CT); tour operator services are 998555.
- **GST facts live in `@travel-crm/contracts/kernel`**: the state list with GST codes (retired 25 and 28 left out)
  and GSTIN validation, with its base-36 Luhn check character (proved on the GST Network's sample GSTIN). Forms
  (plan 4's onboarding) and the engine share one copy; the kernel re-exports them.

### Time and phone numbers

- **Instants are `Date`s in UTC**, stored as `timestamptz`, and shown and counted in the organization's IANA time
  zone (`organization.time_zone`, ADR 0009): `calendarDateIn`, `yearIn`, `startOfDayIn`, `formatDateTime`.
  `formatDateTime` uses Indian English (`15 Oct 2026, 9:30 pm`, and en-IN's own `Sept`).
- **Zones are IANA names only.** `isValidTimeZone` takes `Area/Location` names and `UTC`, and refuses offsets
  (`+05:30`) and abbreviations (`IST`, `EST`), which the runtime would otherwise accept and map unpredictably.
- **Calendar dates have no time**: a departure on 15 October is `"2026-10-15"` (`CalendarDate`, Postgres `date`),
  never a midnight instant that shifts with the zone. `startOfDayIn` handles daylight saving, including zones that
  skip midnight.
- **Phone numbers are saved in E.164** (`+919876543210`). The `phoneNumber` contract normalises what people type,
  with India as the default country, and refuses invalid numbers and extensions (E.164 can't hold them). It uses
  libphonenumber-js's small metadata, which checks the country and the number's length, to keep the web app's bundle
  small; the full metadata would also check number ranges.
- **Translation (next-intl) arrives with the web app** in plan 5. Until then the kernel formats in Indian English.

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
- Code that counts days or years (document numbers, reminders, the subscription lifecycle) passes the
  organization's time zone explicitly.
- The validation helpers (GST, time zones, calendar dates, phone numbers) live in `@travel-crm/contracts/kernel`,
  so a form and the domain can't disagree; the domain kernel re-exports the ones it uses.
