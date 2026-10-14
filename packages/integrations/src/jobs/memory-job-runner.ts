// An in-memory JobRunner for tests. It runs the jobs a MemoryJobQueue holds when the test says so, retrying a
// failing job up to its retry limit straight away and recording what still failed, as pg-boss would after backoff.
import { assertQueueName, type JobData } from "./job-queue.js";
import type { JobHandlerFunction, JobRunner, ScheduleOptions } from "./job-runner.js";
import type { MemoryJobQueue, SentJob } from "./memory-job-queue.js";
import { defaultRetryPolicy } from "./retry-policy.js";

export interface MemorySchedule {
  queue: string;
  cron: string;
  timeZone: string;
  data: JobData;
}

export interface MemoryFailedJob {
  job: SentJob;
  attempts: number;
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

export function createMemoryJobRunner(queue: MemoryJobQueue): MemoryJobRunner {
  const handlers = new Map<string, JobHandlerFunction>();
  const schedules: MemorySchedule[] = [];
  const failed: MemoryFailedJob[] = [];
  const finished = new Set<string>();

  async function run(job: SentJob, handler: JobHandlerFunction): Promise<void> {
    const retryLimit = job.options.retryLimit ?? defaultRetryPolicy.retryLimit;
    for (let retryCount = 0; ; retryCount += 1) {
      try {
        await handler({ id: job.id, data: job.data, retryCount });
        return;
      } catch (error) {
        if (retryCount >= retryLimit) {
          failed.push({ job, attempts: retryCount + 1, error: error instanceof Error ? error.message : String(error) });
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
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        schedules.push({ queue: name, cron, timeZone: options.timeZone, data: options.data ?? {} });
        resolve();
      }),
    unschedule: (name) =>
      new Promise((resolve) => {
        const index = schedules.findIndex((schedule) => schedule.queue === name);
        if (index >= 0) schedules.splice(index, 1);
        resolve();
      }),
    async runQueued() {
      let ran = 0;
      for (;;) {
        const next = queue.sent.find((job) => !finished.has(job.id) && handlers.has(job.queue));
        const handler = next && handlers.get(next.queue);
        if (!next || !handler) return ran;
        finished.add(next.id);
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
