// What a cancellation costs (spec 4.6, 5.8): the agency's steps pick a share by how many days are left before departure, and
// the charge is that share of the trip's total including GST (owner, 2026-10-29). What was paid beyond the charge goes back;
// what was paid short of it is simply not refunded: the refund is never negative.
import type { Policy, PolicyRule } from "@travel-crm/contracts/bookings";
import { policy as policySchema } from "@travel-crm/contracts/bookings";
import { defaultPolicyRules } from "./settings.js";

const DAY = 24 * 3_600_000;

/** Whole days from the cancellation day to departure (a calendar day each); null for a trip with no date; negative after it left. */
export function daysBefore(departure: Date | null, cancelledOn: Date): number | null {
  if (departure === null) return null;
  const from = Date.UTC(cancelledOn.getUTCFullYear(), cancelledOn.getUTCMonth(), cancelledOn.getUTCDate());
  return Math.round((departure.getTime() - from) / DAY);
}

/** The step in force: the one starting furthest out that is not further out than the days left. A trip with no date, or past, takes the nearest step. */
export function ruleFor(rules: readonly PolicyRule[], days: number | null): PolicyRule {
  const left = Math.max(0, days ?? 0);
  const sorted = [...rules].sort((a, b) => a.daysBeforeMin - b.daysBeforeMin);
  let chosen = sorted[0] ?? defaultPolicyRules[0];
  for (const rule of sorted) if (rule.daysBeforeMin <= left) chosen = rule;
  if (chosen === undefined) throw new RangeError("A policy has at least one step");
  return chosen;
}

export interface CancellationCosts {
  daysBefore: number | null;
  chargeBasisPoints: number;
  chargePaise: number;
  refundPaise: number;
}

/** The charge and refund for a trip worth totalPaise, of which paidPaise has been paid. `chargeOverridePaise` replaces the worked-out charge. */
export function cancellationCosts(input: {
  policy: Policy;
  departure: Date | null;
  cancelledOn: Date;
  totalPaise: number;
  paidPaise: number;
  chargeOverridePaise?: number | undefined;
}): CancellationCosts {
  const days = daysBefore(input.departure, input.cancelledOn);
  const rule = ruleFor(input.policy.rules, days);
  const worked = Math.round((input.totalPaise * rule.chargeBasisPoints) / 10_000);
  const chargePaise = Math.min(input.chargeOverridePaise ?? worked, Math.max(input.totalPaise, input.paidPaise));
  return {
    daysBefore: days,
    chargeBasisPoints: rule.chargeBasisPoints,
    chargePaise,
    refundPaise: Math.max(0, input.paidPaise - chargePaise),
  };
}

/** A stored snapshot, checked; null (a carried-over booking) or a malformed one gives null so the policy of the day is used. */
export function snapshotOf(value: unknown): Policy | null {
  const parsed = policySchema.safeParse(value);
  return parsed.success && parsed.data.rules.length > 0 ? parsed.data : null;
}
