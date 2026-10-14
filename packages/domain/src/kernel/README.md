# kernel

The shared kernel (spec 8, 9.6): building blocks every module uses. It imports no domain module.

## Public functions and values (`index.ts`)

- **Who acts:** `Actor`, `ActorSource`, `systemActor(organizationId)` (ADR 0009).
- **Errors:** `DomainError(code, reason, message)`, `DomainErrorCode`.
- **Money** (integer paise, ADR 0016):
  - `Money`, `CurrencyCode` (`"INR"`), `money(paise, currency?)`, `parseRupees(text)`;
  - `add`, `subtract`, `negate`, `multiply(amount, quantity)`, `sum(amounts)`, `compare`, `isZero`;
  - `percentageOf(amount, basisPoints, rounding?)`, `fractionOf(amount, numerator, denominator, rounding?)`,
    `allocate(amount, ratios)`, `Rounding` (`"half-up"`, the default, or `"half-even"`);
  - `formatMoney(amount, { symbol? })` → `₹12,50,000.00`, `formatIndianNumber(value, { fractionDigits? })` →
    `1,23,45,678`.
- **Tax** (ADR 0016):
  - `TaxEngine<Input, Breakdown>` with `compute(input)`, and `TaxBreakdown`, `TaxedLine`, `TaxComponent`;
  - `indiaGst`: `IndiaGstInput` (supplier's state, place of supply or `"OUTSIDE_INDIA"`, lines with a SAC code,
    taxable value and rate in basis points) → `IndiaGstBreakdown` (`supplyType`, per-line and total CGST/SGST/UTGST
    or IGST);
  - GST facts, from `@travel-crm/contracts/kernel`: `gstStates`, `GstStateCode`, `isGstStateCode`,
    `isUnionTerritoryWithoutLegislature`, `isValidGstin`, `gstStateCodeFromGstin`.

## Events

None.

## Rules worth knowing

- Money is never a float: amounts are safe integers of paise, typed amounts are read digit by digit, and every
  fraction is rounded once, at the end, by the rounding the caller names.
- Mixing currencies throws. Results too large to hold exactly throw `RangeError`.
- The tax engine takes the place of supply and each item's rate from the caller: it holds no place-of-supply rules
  and no list of slabs, so a rate change needs no code change.
