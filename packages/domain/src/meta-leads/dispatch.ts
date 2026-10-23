// The worker's dispatcher for the catch-ups (M16): every minute it claims the Pages whose catch-up is due, the most overdue
// first, and queues one meta.catchup job for each, with ids only. Nothing is replayed for ticks missed while the worker
// slept: the first tick after waking finds every Page overdue, and the cursor, not the tick count, decides what is read.
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { ScheduledJob } from "../jobs/index.js";
import { catchupClaimSeconds, maxCatchupsPerMinute } from "./limits.js";
import { claimDueCatchups } from "./routes.js";

export const META_DISPATCH_QUEUE = "meta.dispatch-catchups";
export const META_CATCHUP_QUEUE = "meta.catchup";

/** A backlog of leads is not retried at pg-boss's fifteen minutes. */
const CATCHUP_EXPIRES_IN_SECONDS = 3600;

export interface MetaDispatchDependencies {
  db: Database;
  queue: JobQueue;
}

export async function dispatchDueCatchups(
  dependencies: MetaDispatchDependencies,
  now: Date,
): Promise<{ queued: number }> {
  const due = await claimDueCatchups(dependencies.db, {
    now,
    limit: maxCatchupsPerMinute,
    claimSeconds: catchupClaimSeconds,
  });
  for (const page of due) {
    await dependencies.queue.send(META_CATCHUP_QUEUE, page, { expireInSeconds: CATCHUP_EXPIRES_IN_SECONDS });
  }
  return { queued: due.length };
}

/** meta.dispatch-catchups: every minute, the finest granularity pg-boss schedules have. */
export function metaDispatchSchedule(dependencies: MetaDispatchDependencies): ScheduledJob {
  return {
    queue: META_DISPATCH_QUEUE,
    cron: "* * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await dispatchDueCatchups(dependencies, new Date());
    },
  };
}
