// What the platform log keeps of a change platform staff make to a subscription (ADR 0020), beside the organization's
// own entry: ids, days and amounts in paise and who acted, and only when something changed, so a super admin can
// review every change from the console.
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { PlatformTx } from "@travel-crm/db/platform";
import type { AuditSnapshot } from "../audit/index.js";
import * as subscriptions from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * A billing change in the platform log, beside the organization's own entry: ids, days and amounts in paise and who
 * acted, never a reason or a payment's reference, which may name someone.
 */
export async function logBillingChange(
  tx: PlatformTx,
  staff: PlatformActor,
  organizationId: string,
  change: { action: string; before?: AuditSnapshot; after: AuditSnapshot },
): Promise<void> {
  await recordPlatformAudit(tx, staff, {
    ...change,
    targetType: "subscription",
    targetId: organizationId,
    targetOrganizationId: organizationId,
  });
}

/** What the platform log shows of a subscription for one kind of change. */
export type Shown = (details: SubscriptionDetails) => AuditSnapshot;

export const planShown: Shown = ({ plan, billingCycle }) => ({ planId: plan.id, billingCycle });
export const overridesShown: Shown = ({ extraSeats, customPricePaise, extraModules }) => ({
  extraSeats,
  customPricePaise,
  extraModules,
});
export const trialShown: Shown = ({ trialEndsOn, status }) => ({ trialEndsOn, status });
export const paidShown: Shown = ({ paidThrough, status }) => ({ paidThrough, status });
// Whether the suspension is by hand, not its reason, which may name someone.
export const suspensionShown: Shown = ({ status, manualSuspension }) => ({
  status,
  suspendedByHand: manualSuspension !== null,
});
export const statusShown: Shown = ({ status }) => ({ status });

/**
 * A change to the subscription in one platform transaction, also logged as `action` when what `shown` picks of it
 * changed: like the organization's own log, nothing for a change that changed nothing. The subscription is held
 * first, as the change itself holds it, so `before` is what the change starts from.
 */
export async function loggedChange(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
  logged: { action: string; shown: Shown },
  change: (tx: PlatformTx) => Promise<SubscriptionDetails>,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction(async (tx) => {
    const before = logged.shown(await subscriptions.lockSubscription(tx, organizationId));
    const changed = await change(tx);
    const after = logged.shown(changed);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await logBillingChange(tx, staff, organizationId, { action: logged.action, before, after });
    }
    return changed;
  });
}
