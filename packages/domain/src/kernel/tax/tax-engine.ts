// The tax engine interface (spec 9.6): lines in, taxes per line and in total out. India GST is the Phase 1
// implementation; Phase 3 adds other countries behind the same shape.
import type { Money } from "../money.js";

/** One tax on one line or in total, e.g. CGST at 9 % (rateBasisPoints 900). */
export interface TaxComponent {
  readonly name: string;
  /** Hundredths of a percent; may end in .5 where a rate is split in two (CGST of 5 % is 250). */
  readonly rateBasisPoints: number;
  readonly amount: Money;
}

export interface TaxedLine {
  readonly description: string;
  /** The line's tax classification, e.g. a SAC code in India. */
  readonly code: string;
  readonly taxableValue: Money;
  readonly components: readonly TaxComponent[];
  readonly tax: Money;
  readonly total: Money;
}

export interface TaxBreakdown {
  readonly lines: readonly TaxedLine[];
  /** Totals per tax and rate, in the order they first appear: what an invoice's tax summary shows. */
  readonly components: readonly TaxComponent[];
  readonly taxableValue: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface TaxEngine<Input, Breakdown extends TaxBreakdown = TaxBreakdown> {
  compute(input: Input): Breakdown;
}
