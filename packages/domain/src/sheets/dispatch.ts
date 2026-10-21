// The worker's dispatcher (spec 7, S35-S37): every minute it claims the sheets that are due, for each service account not
// held, the most overdue first and at most the account's reads for the minute, and queues one sheets.check job for each,
// with ids only. Nothing is replayed for ticks missed while the worker slept: the first tick after waking finds every
// sheet overdue, and the checks (which read from the stored cursor) catch up within the budget over the next ticks.
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { ScheduledJob } from "../jobs/index.js";
import type { AccountHolds } from "./account-holds.js";
import { claimSeconds, maxReadsPerMinutePerAccount } from "./limits.js";
import { claimDueSheets } from "./schedule.js";

export const SHEETS_DISPATCH_QUEUE = "sheets.dispatch-checks";
export const SHEETS_CHECK_QUEUE = "sheets.check";

/** A backlog of twenty thousand rows is not retried at pg-boss's fifteen minutes. */
const CHECK_EXPIRES_IN_SECONDS = 3600;

export interface DispatchDependencies {
  db: Database;
  queue: JobQueue;
  /** How many service accounts there are. */
  accounts: number;
  holds: AccountHolds;
}

export async function dispatchDueChecks(
  dependencies: DispatchDependencies,
  now: Date,
): Promise<{ queued: number; byAccount: Record<number, number> }> {
  const byAccount: Record<number, number> = {};
  let queued = 0;
  for (let accountIndex = 0; accountIndex < dependencies.accounts; accountIndex += 1) {
    if (dependencies.holds.isHeld(accountIndex, now)) continue;
    const due = await claimDueSheets(dependencies.db, {
      now,
      accountIndex,
      limit: maxReadsPerMinutePerAccount,
      claimSeconds,
    });
    for (const sheet of due) {
      await dependencies.queue.send(SHEETS_CHECK_QUEUE, sheet, { expireInSeconds: CHECK_EXPIRES_IN_SECONDS });
    }
    byAccount[accountIndex] = due.length;
    queued += due.length;
  }
  return { queued, byAccount };
}

/** sheets.dispatch-checks: every minute, the finest granularity pg-boss schedules have. */
export function sheetsDispatchSchedule(dependencies: DispatchDependencies): ScheduledJob {
  return {
    queue: SHEETS_DISPATCH_QUEUE,
    cron: "* * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await dispatchDueChecks(dependencies, new Date());
    },
  };
}
