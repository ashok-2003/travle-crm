// An in-memory JobAdministration for tests: failed jobs and schedules a test sets up, and what was retried or removed.
import { compareFailedJobs, type FailedJob, type JobAdministration } from "./job-administration.js";

export interface MemoryJobAdministration extends JobAdministration {
  /** The failed jobs, in any order (they are listed newest first); retrying one takes it off, as pg-boss does. */
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
    failedJobs: ({ limit = 50, after, queue } = {}) =>
      Promise.resolve(
        failed
          .filter(
            (job) => (queue === undefined || job.queue === queue) && (!after || compareFailedJobs(job, after) > 0),
          )
          .sort(compareFailedJobs)
          .slice(0, limit),
      ),
    retryFailedJob: (queue, jobId) => {
      const index = failed.findIndex((job) => job.queue === queue && job.id === jobId);
      if (index < 0) return Promise.resolve(false);
      failed.splice(index, 1);
      retried.push({ queue, jobId });
      return Promise.resolve(true);
    },
    schedules: () => Promise.resolve([...scheduled]),
    unschedule: (queue) => {
      const index = scheduled.findIndex((schedule) => schedule.queue === queue);
      if (index >= 0) scheduled.splice(index, 1);
      return Promise.resolve();
    },
  };
}
