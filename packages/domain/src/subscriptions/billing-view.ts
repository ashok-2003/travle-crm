// What the Owner's Plan & billing page shows (spec 2026-11-27, part B): the plan's limits beside what the organization
// uses of them, and the payments recorded for it. Seats, AI credits and stored bytes come from their own modules, so the
// caller passes them in. Read only; no price but the Owner's own payments, so it needs billing:view.
import type { BillingView } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { fromDateColumn } from "./dates.js";
import type { Entitlements } from "./entitlements.js";

/** How many of the newest payments the page lists. */
const PAYMENTS_SHOWN = 24;

export async function billingViewOf(
  tx: OrgTx,
  entitlements: Entitlements,
  organizationId: string,
  use: { seats: number; aiCredits: { limit: number; used: number }; storageUsedBytes: number },
): Promise<BillingView> {
  const [whatsappNumbers, payments] = await Promise.all([
    tx.whatsappConnection.count({ where: { status: { not: "disconnected" } } }),
    tx.subscriptionPayment.findMany({
      where: { organizationId, voidedAt: null },
      orderBy: [{ paidOn: "desc" }, { recordedAt: "desc" }],
      take: PAYMENTS_SHOWN,
    }),
  ]);
  const { limits } = entitlements;
  return {
    planName: entitlements.planName,
    status: entitlements.status,
    paidThrough: entitlements.paidThrough,
    seats: { limit: limits.seats, used: use.seats },
    whatsappNumbers: { limit: limits.whatsappNumbers, used: whatsappNumbers },
    storageBytes: { limit: limits.storageBytes, used: use.storageUsedBytes },
    aiCredits: use.aiCredits,
    payments: payments.map((payment) => ({
      paidOn: fromDateColumn(payment.paidOn),
      amountPaise: payment.amountPaise,
      paidThrough: fromDateColumn(payment.paidThrough),
      reference: payment.reference,
    })),
  };
}
