// The nightly lifecycle job (spec 7.3): records each organization's subscription as far as its unpaid days have taken
// it. The request checks and the console already compute the state due today; this writes it down and logs each
// change. It runs in the console process as the platform role, the only role that writes a subscription.
import type { OrgTx } from "@travel-crm/db";
import { describeError, ownMessages } from "@travel-crm/integrations/jobs";
import { recordAudit } from "../audit/index.js";
import { systemActor } from "../kernel/index.js";
import { lockSubscriptionRow, statusColumns, subscriptionToday } from "./state.js";

/** The console's nightly job's queue. */
export const ADVANCE_SUBSCRIPTIONS_QUEUE = "subscriptions.advance-lifecycle";

/** A status the job moved, and the day the new one began. */
export interface StatusChange {
  organizationId: string;
  from: string;
  to: string;
  since: string;
}

/** Runs one function in one transaction that may write subscriptions: the console's platform transactions. */
export interface SubscriptionWriter {
  transaction<T>(fn: (tx: OrgTx) => Promise<T>): Promise<T>;
}

/**
 * Some organizations' subscriptions could not be advanced; the others were. Ids and error names only, so pg-boss keeps
 * the message and the console's failed-jobs list shows it; a rerun is safe.
 */
export class LifecycleJobError extends Error {
  static {
    ownMessages(this);
  }

  constructor(
    readonly failures: readonly { organizationId: string; error: unknown }[],
    readonly changes: readonly StatusChange[],
    total: number,
  ) {
    const [first] = failures;
    super(
      `${String(failures.length)} of ${String(total)} subscriptions not advanced; the first, ` +
        `${first?.organizationId ?? "none"}: ${describeError(first?.error)}`,
    );
    this.name = "LifecycleJobError";
  }
}

/**
 * Moves one organization's subscription to where it is due today. It holds the row first and works from it as held,
 * so a payment or other change from the console is either already in what it reads or waits for it, and is never
 * overwritten. Recorded as "subscription.status-changed" by the system. Returns null when nothing moved.
 */
export async function advanceSubscription(tx: OrgTx, organizationId: string, now: Date): Promise<StatusChange | null> {
  const row = await lockSubscriptionRow(tx, organizationId);
  if (!row) return null;
  const today = await subscriptionToday(tx, row, now);
  const { recorded, due } = today;
  if (due.status === recorded.status) return null;
  await tx.subscription.update({ where: { organizationId }, data: statusColumns(today, due) });
  await recordAudit(tx, systemActor(organizationId), {
    action: "subscription.status-changed",
    entityType: "subscription",
    entityId: organizationId,
    before: { status: recorded.status },
    after: { status: due.status, since: due.since },
  });
  return { organizationId, from: recorded.status, to: due.status, since: due.since };
}

/** The subscriptions the lifecycle can still move: suspended and cancelled ones wait for a person. */
async function movingSubscriptions(tx: OrgTx): Promise<string[]> {
  const rows = await tx.subscription.findMany({
    where: { status: { in: ["trial", "active", "past_due", "read_only"] } },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  return rows.map((row) => row.organizationId);
}

/**
 * The job: each organization in its own transaction, so one that fails doesn't stop the rest; then, if any failed,
 * one LifecycleJobError naming them, so the job is retried and shows as failed. Safe to run twice: a second run finds
 * nothing due. `organizationIds` limits it to those (tests); by default, every subscription the lifecycle can move.
 */
export async function advanceSubscriptions(dependencies: {
  db: SubscriptionWriter;
  organizationIds?: readonly string[];
  now?: Date;
}): Promise<StatusChange[]> {
  const { db } = dependencies;
  const now = dependencies.now ?? new Date();
  const organizationIds = dependencies.organizationIds ?? (await db.transaction(movingSubscriptions));
  const changes: StatusChange[] = [];
  const failures: { organizationId: string; error: unknown }[] = [];
  for (const organizationId of organizationIds) {
    try {
      const change = await db.transaction((tx) => advanceSubscription(tx, organizationId, now));
      if (change) changes.push(change);
    } catch (error) {
      failures.push({ organizationId, error });
    }
  }
  if (failures.length > 0) throw new LifecycleJobError(failures, changes, organizationIds.length);
  return changes;
}
