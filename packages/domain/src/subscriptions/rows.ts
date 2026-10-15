// How the subscriptions module reads its rows. The tables' checks keep every value to the known ones, so anything else
// is a bug worth failing loudly on.
import type {
  BillingCycle,
  PlanModule,
  PlanSummary,
  SubscriptionPayment,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import { billingCycle, paymentProvider, planModule, subscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { fromDateColumn } from "./dates.js";

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthlyPricePaise: number | null;
  yearlyPricePaise: number | null;
  extraSeatMonthlyPricePaise: number | null;
  extraSeatYearlyPricePaise: number | null;
  seatLimit: number;
  whatsappNumberLimit: number;
  storageLimitBytes: bigint;
  modules: string[];
  archivedAt: Date | null;
}

export function planSummaryOf(row: PlanRow): PlanSummary {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    monthlyPricePaise: row.monthlyPricePaise,
    yearlyPricePaise: row.yearlyPricePaise,
    extraSeatMonthlyPricePaise: row.extraSeatMonthlyPricePaise,
    extraSeatYearlyPricePaise: row.extraSeatYearlyPricePaise,
    seatLimit: row.seatLimit,
    whatsappNumberLimit: row.whatsappNumberLimit,
    // Limits are at most 10 TB (the contract's), well within a safe integer.
    storageLimitBytes: Number(row.storageLimitBytes),
    modules: modulesOf(row.modules),
    archived: row.archivedAt !== null,
  };
}

export function modulesOf(values: readonly string[]): PlanModule[] {
  return values.map((value) => planModule.parse(value));
}

export function statusOf(value: string): SubscriptionStatus {
  return subscriptionStatus.parse(value);
}

export function billingCycleOf(value: string): BillingCycle {
  return billingCycle.parse(value);
}

/** A subscription row with its plan, as every read and change of one loads it. */
export interface StoredSubscription {
  organizationId: string;
  billingCycle: string;
  status: string;
  statusChangedAt: Date;
  trialEndsOn: Date | null;
  paidThrough: Date | null;
  extraSeats: number;
  customPricePaise: number | null;
  extraModules: string[];
  manualSuspensionAt: Date | null;
  manualSuspensionBy: string | null;
  manualSuspensionReason: string | null;
  plan: PlanRow;
}

/** What to include to load a StoredSubscription. */
export const withPlan = { plan: true } as const;

interface PaymentRow {
  id: string;
  amountPaise: number;
  paidOn: Date;
  paidThrough: Date;
  reference: string | null;
  provider: string;
  recordedBy: string | null;
  recordedAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export function paymentOf(row: PaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    amountPaise: row.amountPaise,
    paidOn: fromDateColumn(row.paidOn),
    paidThrough: fromDateColumn(row.paidThrough),
    reference: row.reference,
    provider: paymentProvider.parse(row.provider),
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
    voided:
      row.voidedAt && row.voidReason !== null
        ? { at: row.voidedAt.toISOString(), by: row.voidedBy, reason: row.voidReason }
        : null,
  };
}
