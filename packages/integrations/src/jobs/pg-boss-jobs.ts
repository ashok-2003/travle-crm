// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
import { sanitizeJobError, toError } from "./sanitize-job-error.js";

export interface PgBossJobsSettings {
  /** Postgres as the app_runtime role. */
  connectionString: string;
  /** Size of pg-boss's own connection pool. */
  maxConnections?: number;
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
  /** How the queues this instance creates retry failed jobs. Tests shorten it; production keeps the default. */
  retryPolicy?: RetryPolicy;
  /**
   * Where pg-boss's errors go (a failing maintenance query, a lost connection), its warnings (prefixed "pg-boss
   * warning:"), the original errors of failing handlers, and failed-job rows that couldn't be read.
   */
  onError?: (error: Error) => void;
}

/** A job that used all its retries, for the platform console's failed-jobs list (plan 4). */
export interface FailedJob {
  id: string;
  queue: string;
  data: JobData;
  /** Every attempt, the first one included. */
  attempts: number;
  /** Null when pg-boss recorded no completion time. */
  failedAt: Date | null;
  /** The last attempt's error message. */
  error: string;
}

export interface PgBossJobs extends JobQueue, JobRunner {
  start(): Promise<void>;
  /** Stops taking jobs, waits up to 30 seconds for running handlers to finish, and closes the pool. */
  stop(): Promise<void>;
  /** Failed jobs, newest first. Data access only: the console screen is plan 4's. */
  failedJobs(options?: { limit?: number }): Promise<FailedJob[]>;
  /** The schedules pg-boss holds, for operations and tests. */
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
}

/** The schema our migrations create pg-boss in (migration 20261015100000_pgboss). */
const SCHEMA = "pgboss";

const MAX_FAILED_JOBS = 500;

interface FailedJobRow {
  id: string;
  name: string;
  data: unknown;
  retry_count: number;
  completed_on: Date | null;
  output: unknown;
}

/**
 * Job data is a flat object of strings, numbers, booleans and nulls (the port's JobData); anything else is refused.
 * A job sent without data has none (null), which is an empty object here.
 */
function toJobData(value: unknown): JobData {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("Job data is not a plain object");
  for (const [key, field] of Object.entries(value)) {
    if (field !== null && !["string", "number", "boolean"].includes(typeof field)) {
      throw new TypeError(`Job data field ${key} is not a string, number, boolean or null`);
    }
  }
  return value as JobData;
}

function errorMessageOf(output: unknown): string {
  if (typeof output === "object" && output !== null && "message" in output && typeof output.message === "string") {
    return output.message;
  }
  return "unknown error";
}

export function createPgBossJobs(settings: PgBossJobsSettings): PgBossJobs {
  const boss = new PgBoss({
    connectionString: settings.connectionString,
    schema: SCHEMA,
    max: settings.maxConnections ?? 5,
    // Our migrations own pg-boss's schema; the runtime role may not change it.
    migrate: false,
    createSchema: false,
  });
  function report(error: Error): void {
    if (settings.onError) settings.onError(error);
    else console.error("pg-boss error", error);
  }
  boss.on("error", (error) => {
    report(toError(error));
  });
  boss.on("warning", (warning) => {
    report(new Error(`pg-boss warning: ${toError(warning).message}`));
  });

  // pg-boss 12 needs a queue to exist before jobs are sent to or worked from it. Creating one is idempotent
  // (ON CONFLICT DO NOTHING): an existing queue keeps the policy it was created with, so changing the default retry
  // policy does not reach queues that already exist.
  const retryPolicy = settings.retryPolicy ?? defaultRetryPolicy;
  const queues = new Map<string, Promise<void>>();
  function ensureQueue(name: string): Promise<void> {
    assertQueueName(name);
    let created = queues.get(name);
    if (!created) {
      created = boss.createQueue(name, {
        retryLimit: retryPolicy.retryLimit,
        retryDelay: retryPolicy.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: retryPolicy.retryDelayMaxSeconds,
      });
      // A failed creation is not cached: the next use tries again.
      created.catch(() => queues.delete(name));
      queues.set(name, created);
    }
    return created;
  }

  return {
    start: async () => {
      await boss.start();
    },
    stop: () => boss.stop({ graceful: true, timeout: 30_000 }),

    async send(queue, data, options = {}) {
      await ensureQueue(queue);
      return boss.send(queue, data, {
        ...(options.id === undefined ? {} : { id: options.id }),
        ...(options.startAfter === undefined ? {} : { startAfter: options.startAfter }),
        ...(options.retryLimit === undefined ? {} : { retryLimit: options.retryLimit }),
        ...(options.retryDelaySeconds === undefined
          ? {}
          : { retryDelay: options.retryDelaySeconds, retryBackoff: true }),
      });
    },

    async work(queue, handler, options = {}) {
      await ensureQueue(queue);
      await boss.work<JobData>(
        queue,
        {
          batchSize: 1,
          localConcurrency: options.concurrency ?? 1,
          pollingIntervalSeconds: settings.pollingIntervalSeconds ?? 2,
        },
        async ([job]) => {
          if (!job) return;
          try {
            await handler({ id: job.id, data: toJobData(job.data), retryCount: job.retryCount });
          } catch (error) {
            // pg-boss stores what we throw, in a table without row-level security: log the original, throw a cut-down copy.
            try {
              report(toError(error));
            } catch {
              // A broken logger must not replace the sanitised error pg-boss stores.
            }
            throw sanitizeJobError(error);
          }
        },
      );
    },

    async schedule(queue, cron, { timeZone, data }) {
      await ensureQueue(queue);
      await boss.schedule(queue, cron, data ?? {}, { tz: timeZone });
    },

    async unschedule(queue) {
      assertQueueName(queue);
      await boss.unschedule(queue);
    },

    async schedules() {
      return (await boss.getSchedules()).map((schedule) => ({
        queue: schedule.name,
        cron: schedule.cron,
        timeZone: schedule.timezone,
      }));
    },

    async failedJobs({ limit = 50 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FAILED_JOBS) {
        throw new RangeError(`limit must be a whole number from 1 to ${String(MAX_FAILED_JOBS)}`);
      }
      const { rows } = await boss.getDb().executeSql(
        `SELECT id, name, data, retry_count, completed_on, output FROM ${SCHEMA}.job
         WHERE state = 'failed' ORDER BY completed_on DESC NULLS LAST LIMIT $1`,
        [limit],
      );
      const failed: FailedJob[] = [];
      for (const row of rows as FailedJobRow[]) {
        try {
          failed.push({
            id: row.id,
            queue: row.name,
            data: toJobData(row.data),
            attempts: row.retry_count + 1,
            failedAt: row.completed_on,
            error: errorMessageOf(row.output),
          });
        } catch (error) {
          // One unreadable row must not hide the others from the console.
          report(new Error(`Failed job ${row.id} on ${row.name} can't be listed: ${toError(error).message}`));
        }
      }
      return failed;
    },
  };
}
