// An in-memory JobQueue for tests: it records what was sent, and repeats of a job id queue nothing, as in pg-boss.
import { randomUUID } from "node:crypto";
import { assertQueueName, type JobData, type JobOptions, type JobQueue } from "./job-queue.js";

export interface SentJob {
  id: string;
  queue: string;
  data: JobData;
  options: JobOptions;
}

export interface MemoryJobQueue extends JobQueue {
  /** Every job queued so far, oldest first. */
  readonly sent: readonly SentJob[];
}

export function createMemoryJobQueue(): MemoryJobQueue {
  const sent: SentJob[] = [];

  return {
    sent,
    send: (queue, data, options = {}) =>
      new Promise((resolve) => {
        assertQueueName(queue);
        if (options.id !== undefined && sent.some((job) => job.id === options.id)) {
          resolve(null);
          return;
        }
        const job = { id: options.id ?? randomUUID(), queue, data, options };
        sent.push(job);
        resolve(job.id);
      }),
  };
}
