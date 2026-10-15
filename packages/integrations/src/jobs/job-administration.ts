// What the platform console does with every process's jobs (spec 9.1): see what failed, a page at a time, run one
// again, see and remove schedules. PgBossJobs implements it; tests use the in-memory adapter.
import type { JobData } from "./job-queue.js";

/** A job that used all its retries, for the platform console's failed-jobs list (plan 4). */
export interface FailedJob {
  id: string;
  queue: string;
  data: JobData;
  /** Every attempt, the first one included. */
  attempts: number;
  /** To the millisecond; null when pg-boss recorded no completion time. */
  failedAt: Date | null;
  /** The last attempt's error message. */
  error: string;
}

/** Where a page of failed jobs starts: after this job, the last of the page before. */
export interface FailedJobsAfter {
  failedAt: Date | null;
  id: string;
}

export interface FailedJobsOptions {
  /** 1 to 500; 50 by default. */
  limit?: number;
  /** The jobs after this one in the list's order; the first page without it. */
  after?: FailedJobsAfter;
  /** One queue's failed jobs only. */
  queue?: string;
}

export interface JobAdministration {
  /**
   * Failed jobs, newest first: by when they failed, then by id, so a page ends at a definite job and the next one
   * starts after it. A job without a time comes last.
   */
  failedJobs(options?: FailedJobsOptions): Promise<FailedJob[]>;
  /**
   * Gives a failed job one more attempt, now. It doesn't start the job's series of retries again: pg-boss adds one to
   * its retry limit (node_modules/pg-boss/dist/plans.js, retryJobs), so if that attempt fails too the job is back in
   * the list at once, one attempt longer. Returns false, changing nothing, when the queue has no failed job of that id
   * or there is no such queue.
   */
  retryFailedJob(queue: string, jobId: string): Promise<boolean>;
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
  unschedule(queue: string): Promise<void>;
}

/** The list's order, newest first and then by id, for adapters that sort in memory. */
export function compareFailedJobs(a: FailedJobsAfter, b: FailedJobsAfter): number {
  const time = (b.failedAt?.getTime() ?? -Infinity) - (a.failedAt?.getTime() ?? -Infinity);
  if (time !== 0 && !Number.isNaN(time)) return time;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
