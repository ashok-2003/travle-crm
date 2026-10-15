// The daily lifecycle job (spec 7.3): records each organization's subscription as far as its unpaid days have taken
// it. The request checks already compute the state on every request; this writes it down and logs each change.
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, startOfDayIn, systemActor } from "../kernel/index.js";
import { fromDateColumn } from "./dates.js";
import { dueState } from "./lifecycle.js";
import { getSubscriptionPolicy } from "./policy.js";
import { statusOf } from "./rows.js";

/** A status the job moved, and the day the new one began. */
export interface StatusChange {
  organizationId: string;
  from: string;
  to: string;
  since: string;
}

/**
 * Moves one organization's subscription to where it is due today, as the runtime role inside its forOrg(). Writes only
 * if the subscription is still as it was read: a change from the console in the meantime wins, and the next run looks
 * again. Recorded as "subscription.status-changed" by the system. Returns null when nothing moved.
 */
export async function advanceSubscription(tx: OrgTx, organizationId: string, now: Date): Promise<StatusChange | null> {
  const row = await tx.subscription.findUnique({ where: { organizationId } });
  if (!row) return null;
  const timeZone = await organizationTimeZone(tx, organizationId);
  const stored = {
    status: statusOf(row.status),
    since: calendarDateIn(row.statusChangedAt, timeZone),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
  };
  const due = dueState(stored, await getSubscriptionPolicy(tx), calendarDateIn(now, timeZone));
  if (due.status === stored.status) return null;
  const { count } = await tx.subscription.updateMany({
    where: { organizationId, status: row.status, statusChangedAt: row.statusChangedAt },
    // The day the state began, not the day the job noticed: days in a state count from when it was due.
    data: { status: due.status, statusChangedAt: startOfDayIn(due.since, timeZone) },
  });
  if (count === 0) return null;
  await recordAudit(tx, systemActor(organizationId), {
    action: "subscription.status-changed",
    entityType: "subscription",
    entityId: organizationId,
    before: { status: stored.status },
    after: { status: due.status, since: due.since },
  });
  return { organizationId, from: stored.status, to: due.status, since: due.since };
}

/**
 * The job: each organization in its own transaction, so one that fails (its error goes to onError, ids only) doesn't
 * stop the rest. Safe to run twice: a second run finds nothing due.
 */
export async function advanceSubscriptions(dependencies: {
  db: Pick<Database, "forOrg">;
  organizationIds: readonly string[];
  now?: Date;
  onError?: (error: unknown, organizationId: string) => void;
}): Promise<StatusChange[]> {
  const now = dependencies.now ?? new Date();
  const changes: StatusChange[] = [];
  for (const organizationId of dependencies.organizationIds) {
    try {
      const change = await dependencies.db.forOrg(organizationId, (tx) => advanceSubscription(tx, organizationId, now));
      if (change) changes.push(change);
    } catch (error) {
      dependencies.onError?.(error, organizationId);
    }
  }
  return changes;
}
