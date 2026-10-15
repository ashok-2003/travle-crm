// An in-memory JobAdministration for tests: failed jobs and schedules a test sets up, and what was retried or removed.
import type { FailedJob, JobAdministration } from "./pg-boss-jobs.js";

export interface MemoryJobAdministration extends JobAdministration {
  /** The failed jobs, newest first; retrying one takes it off the list, as pg-boss does. */
  readonly failed: FailedJob[];
  readonly scheduled: { queue: string; cron: string; timeZone: string }[];
  readonly retried: { queue: string; jobId: string }[];
}

export function createMemoryJobAdministration(): MemoryJobAdministration {
  const failed: FailedJob[] = [];
  const scheduled: { queue: string; cron: string; timeZone: string }[] = [];
  const retried: { queue: string; jobId: string }[] = [];
  return {
    failed,
    scheduled,
    retried,
    failedJobs: ({ limit = 50 } = {}) => Promise.resolve(failed.slice(0, limit)),
    retryFailedJob: (queue, jobId) => {
      const index = failed.findIndex((job) => job.queue === queue && job.id === jobId);
      if (index >= 0) {
        failed.splice(index, 1);
        retried.push({ queue, jobId });
      }
      return Promise.resolve();
    },
    schedules: () => Promise.resolve([...scheduled]),
    unschedule: (queue) => {
      const index = scheduled.findIndex((schedule) => schedule.queue === queue);
      if (index >= 0) scheduled.splice(index, 1);
      return Promise.resolve();
    },
  };
}
