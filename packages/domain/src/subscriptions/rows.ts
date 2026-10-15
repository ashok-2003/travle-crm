// How the subscriptions module turns its rows into what callers see.
import type {
  PlanModule,
  PlanSummary,
  SubscriptionDetails,
  SubscriptionPayment,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import { planModule, subscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { fromDateColumn } from "./dates.js";

interface PlanRow {
  id: string;
  key: string;
  name: string;
  monthlyPricePaise: number | null;
  yearlyPricePaise: number | null;
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
    seatLimit: row.seatLimit,
    whatsappNumberLimit: row.whatsappNumberLimit,
    // Limits are at most 10 TB (the contract's), well within a safe integer.
    storageLimitBytes: Number(row.storageLimitBytes),
    modules: modulesOf(row.modules),
    archived: row.archivedAt !== null,
  };
}

/** The table's checks keep modules to the known ones; anything else is a bug worth failing loudly on. */
export function modulesOf(values: readonly string[]): PlanModule[] {
  return values.map((value) => planModule.parse(value));
}

export function statusOf(value: string): SubscriptionStatus {
  return subscriptionStatus.parse(value);
}

export interface SubscriptionRow {
  organizationId: string;
  billingCycle: string;
  status: string;
  statusChangedAt: Date;
  trialEndsOn: Date | null;
  paidThrough: Date | null;
  extraSeats: number;
  customPricePaise: number | null;
  extraModules: string[];
  plan: { id: string; key: string; name: string };
}

export function subscriptionDetailsOf(row: SubscriptionRow): SubscriptionDetails {
  return {
    organizationId: row.organizationId,
    plan: { id: row.plan.id, key: row.plan.key, name: row.plan.name },
    billingCycle: row.billingCycle === "yearly" ? "yearly" : "monthly",
    status: statusOf(row.status),
    statusChangedAt: row.statusChangedAt.toISOString(),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
    extraSeats: row.extraSeats,
    customPricePaise: row.customPricePaise,
    extraModules: modulesOf(row.extraModules),
  };
}

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
    provider: row.provider === "razorpay" ? "razorpay" : "manual",
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
    voided:
      row.voidedAt && row.voidReason !== null
        ? { at: row.voidedAt.toISOString(), by: row.voidedBy, reason: row.voidReason }
        : null,
  };
}
