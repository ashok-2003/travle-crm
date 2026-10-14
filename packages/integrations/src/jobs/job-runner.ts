// The worker's side of the jobs port: run a handler for each job on a queue, and start jobs on a schedule.
// pg-boss implements it; tests use the in-memory runner.
import type { JobData } from "./job-queue.js";

/** A job as its handler sees it. */
export interface RunningJob {
  id: string;
  data: JobData;
  /** 0 on the first attempt, 1 on the first retry, and so on. */
  retryCount: number;
}

export type JobHandlerFunction = (job: RunningJob) => Promise<void>;

export interface ScheduleOptions {
  /** An IANA time zone the cron expression is read in, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** The data each scheduled job carries. */
  data?: JobData;
}

export interface JobRunner {
  /**
   * Runs handler for every job on queue. A handler that rejects fails that attempt: the job is retried with
   * backoff, and after its last retry it lands in the failed list.
   *
   * A failed job's error is stored in pg-boss and shown to platform staff: keep personal data out of error messages
   * (ids only). pg-boss stores a shortened copy with emails and long numbers (phone, Aadhaar) masked; the original goes
   * to the adapter's onError, which is the log. The masking is a safety net: names, addresses, PAN numbers, phone numbers written with dots or brackets (022) 2345.6789, and emails
   * without a domain are not masked.
   */
  work(queue: string, handler: JobHandlerFunction, options?: { concurrency?: number }): Promise<void>;
  /** Queues a job on queue each time the cron expression comes round, read in the given time zone. */
  schedule(queue: string, cron: string, options: ScheduleOptions): Promise<void>;
  /** Stops queue's schedule. */
  unschedule(queue: string): Promise<void>;
}
