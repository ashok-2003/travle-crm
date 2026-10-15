// An in-memory JobRunner for tests. It runs the jobs a MemoryJobQueue holds when the test says so, retrying a
// failing job up to its retry limit straight away and recording what still failed, as pg-boss would after backoff.
// Where it can't act like pg-boss (time, concurrency, logging), the package README lists the differences.
import { assertQueueName, type JobData } from "./job-queue.js";
import type { JobHandlerFunction, JobRunner, ScheduleOptions } from "./job-runner.js";
import type { MemoryJobQueue, SentJob } from "./memory-job-queue.js";
import { defaultRetryPolicy } from "./retry-policy.js";
import { sanitizeJobError } from "./sanitize-job-error.js";

export interface MemorySchedule {
  queue: string;
  cron: string;
  timeZone: string;
  data: JobData;
}

export interface MemoryFailedJob {
  job: SentJob;
  attempts: number;
  /** The last attempt's error, cut down as pg-boss stores it: "Error: message", emails and long numbers masked. */
  error: string;
}

export interface MemoryJobRunner extends JobRunner {
  readonly schedules: readonly MemorySchedule[];
  readonly failed: readonly MemoryFailedJob[];
  /**
   * Runs every queued job that has a handler, oldest first, until none is left (handlers may queue more).
   * Returns the number of jobs run. Jobs on queues nobody works stay queued, as in pg-boss.
   */
  runQueued(): Promise<number>;
  /** Queues a job as the schedule for queue would when its time comes. */
  fireSchedule(queue: string): Promise<void>;
}

/** pg-boss refuses a schedule in a time zone it doesn't know; so does this. */
function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new RangeError(`Unknown time zone ${JSON.stringify(timeZone)}`);
  }
}

export function createMemoryJobRunner(queue: MemoryJobQueue): MemoryJobRunner {
  const handlers = new Map<string, JobHandlerFunction>();
  const schedules: MemorySchedule[] = [];
  const failed: MemoryFailedJob[] = [];
  /** The jobs already run, by the sent job itself: one id may name a job on each of several queues. */
  const finished = new Set<SentJob>();

  async function run(job: SentJob, handler: JobHandlerFunction): Promise<void> {
    const retryLimit = job.options.retryLimit ?? defaultRetryPolicy.retryLimit;
    for (let retryCount = 0; ; retryCount += 1) {
      try {
        // Each attempt reads the job afresh, as pg-boss does: a handler that changes its data changes no retry.
        await handler({ id: job.id, data: structuredClone(job.data), retryCount });
        return;
      } catch (error) {
        if (retryCount >= retryLimit) {
          failed.push({ job, attempts: retryCount + 1, error: sanitizeJobError(error).message });
          return;
        }
      }
    }
  }

  return {
    schedules,
    failed,
    work: (name, handler) =>
      new Promise((resolve) => {
        assertQueueName(name);
        handlers.set(name, handler);
        resolve();
      }),
    schedule: (name, cron, options: ScheduleOptions) =>
      new Promise((resolve) => {
        assertQueueName(name);
        assertTimeZone(options.timeZone);
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        schedules.push({ queue: name, cron, timeZone: options.timeZone, data: structuredClone(options.data ?? {}) });
        resolve();
      }),
    unschedule: (name) =>
      new Promise((resolve) => {
        assertQueueName(name);
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        resolve();
      }),
    async runQueued() {
      let ran = 0;
      for (;;) {
        const next = queue.sent.find((job) => !finished.has(job) && handlers.has(job.queue));
        const handler = next && handlers.get(next.queue);
        if (!next || !handler) return ran;
        finished.add(next);
        await run(next, handler);
        ran += 1;
      }
    },
    async fireSchedule(name) {
      const schedule = schedules.find((candidate) => candidate.queue === name);
      if (!schedule) throw new Error(`No schedule for ${name}`);
      await queue.send(name, schedule.data);
    },
  };
}
