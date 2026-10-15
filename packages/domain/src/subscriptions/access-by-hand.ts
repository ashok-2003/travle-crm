// Ending an organization's access by hand (spec 7.3): platform staff suspend it, apart from the lifecycle, and only a
// super admin lifts that (the console checks who); or they cancel it. Each is recorded in its audit log.
import type { EndAccessInput, SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { lockedSubscription, statusColumns, statusWith } from "./state.js";
import { getSubscription } from "./subscriptions.js";

/**
 * Suspends the organization at once (spec 7.3: the Owner can only export or pay), whatever it has paid: a mark of its
 * own, which no payment clears. Suspending again changes nothing; a cancelled subscription can't be suspended.
 */
export async function suspend(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, input.organizationId, now);
  if (row.manualSuspensionAt !== null) return getSubscription(tx, input.organizationId, now);
  if (today.due.status === "cancelled") {
    throw new DomainError("CONFLICT", "SUBSCRIPTION_CANCELLED", "A cancelled subscription comes back only by paying");
  }
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { manualSuspensionAt: now, manualSuspensionBy: by.userId, manualSuspensionReason: input.reason },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.suspended",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { status: today.status },
    after: { status: "suspended", reason: input.reason },
  });
  return getSubscription(tx, input.organizationId, now);
}

/**
 * Lifts a suspension made by hand: the organization is wherever its lifecycle is today. Super admins only, which the
 * console's procedure checks. Recorded as "subscription.suspension-lifted"; without one, nothing changes.
 */
export async function liftSuspension(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, input.organizationId, now);
  if (row.manualSuspensionAt === null) return getSubscription(tx, input.organizationId, now);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { manualSuspensionAt: null, manualSuspensionBy: null, manualSuspensionReason: null },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.suspension-lifted",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { status: today.status, reason: row.manualSuspensionReason },
    after: { status: statusWith(today.due.status, false), reason: input.reason },
  });
  return getSubscription(tx, input.organizationId, now);
}

/** Cancels the subscription: the data is kept, locked, until a super admin deletes it (spec 5, 7.3). */
export async function cancel(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { today } = await lockedSubscription(tx, input.organizationId, now);
  if (today.due.status === "cancelled") return getSubscription(tx, input.organizationId, now);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: statusColumns(today, { ...today.due, status: "cancelled", since: today.today }),
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.cancelled",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { status: today.status },
    after: { status: "cancelled", reason: input.reason },
  });
  return getSubscription(tx, input.organizationId, now);
}
