// An organization's subscription as the console shows it (spec 7.2-7.4): its state today beside what was recorded,
// a suspension made by hand, its dates and overrides, and its price with GST.
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { lifecycleAccessOf } from "./entitlements.js";
import { priceOf } from "./pricing.js";
import { billingCycleOf, modulesOf, type StoredSubscription } from "./rows.js";
import type { SubscriptionToday } from "./state.js";

export function subscriptionDetailsOf(row: StoredSubscription, today: SubscriptionToday): SubscriptionDetails {
  const cycle = billingCycleOf(row.billingCycle);
  return {
    organizationId: row.organizationId,
    plan: { id: row.plan.id, key: row.plan.key, name: row.plan.name },
    billingCycle: cycle,
    status: today.status,
    access: lifecycleAccessOf(today.status),
    since: today.due.since,
    nextChangeOn: today.nextChangeOn,
    recorded: { status: today.recorded.status, since: today.recorded.since },
    manualSuspension:
      row.manualSuspensionAt && row.manualSuspensionReason !== null
        ? { at: row.manualSuspensionAt.toISOString(), by: row.manualSuspensionBy, reason: row.manualSuspensionReason }
        : null,
    trialEndsOn: today.due.trialEndsOn,
    paidThrough: today.due.paidThrough,
    extraSeats: row.extraSeats,
    customPricePaise: row.customPricePaise,
    extraModules: modulesOf(row.extraModules),
    price: priceOf(row.plan, {
      billingCycle: cycle,
      extraSeats: row.extraSeats,
      customPricePaise: row.customPricePaise,
    }),
  };
}
