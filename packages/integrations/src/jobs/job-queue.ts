// The jobs port (spec 9.1): queue work for the worker. pg-boss implements it; tests use the in-memory queue.

/**
 * What a job carries: ids and small flags, never personal data. The job table has no row-level security, so a job
 * names its organization and record, and the worker reads the record inside db.forOrg().
 */
export type JobData = Readonly<Record<string, string | number | boolean | null>>;

export interface JobOptions {
  /** Retries after the first attempt fails, before the job lands in the failed list. */
  retryLimit?: number;
  /** Seconds before the first retry. Each later retry waits about twice as long as the one before. */
  retryDelaySeconds?: number;
  /** Not before this time. */
  startAfter?: Date;
  /** The job's id, a UUID. Sending the same id again queues nothing and returns null, so a send can be repeated. */
  id?: string;
}

export interface JobQueue {
  /** Queues a job. Returns its id, or null when a job with `options.id` was already queued. */
  send(queue: string, data: JobData, options?: JobOptions): Promise<string | null>;
}

/** Queue names are "<module>.<what it does>", e.g. "documents.render-pdf": lower case, dots between parts. */
const QUEUE_NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export function assertQueueName(name: string): void {
  if (!QUEUE_NAME_PATTERN.test(name)) {
    throw new RangeError(`Queue names look like "documents.render-pdf", got ${JSON.stringify(name)}`);
  }
}
