// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { assertJobId, assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { describeError } from "./describe-error.js";
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
   * The process's log, a line each: a failing handler (its queue, job id and error), pg-boss's own errors (a failing
   * maintenance query, a lost connection; with the queue when pg-boss names one), its warnings in its own words, and
   * failed-job rows that couldn't be read. Errors appear as their names and codes only (describeError), never their
   * messages or the objects, which can quote personal data. Without it, the lines go to stderr.
   */
  log?: (line: string) => void;
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

/** What the platform console does with jobs (spec 9.1): see what failed, run it again, see and remove schedules. */
export interface JobAdministration {
  /** Failed jobs, newest first. */
  failedJobs(options?: { limit?: number }): Promise<FailedJob[]>;
  /** Runs a failed job again, from its first attempt. A job that isn't failed (any more) is left alone. */
  retryFailedJob(queue: string, jobId: string): Promise<void>;
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
  unschedule(queue: string): Promise<void>;
}

export interface PgBossJobs extends JobQueue, JobRunner, JobAdministration {
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
  function report(line: string): void {
    try {
      if (settings.log) settings.log(line);
      else console.error(line);
    } catch {
      // A broken logger must not break pg-boss's loops, nor replace the sanitised error it stores.
    }
  }
  boss.on("error", (error: unknown) => {
    // pg-boss spreads a worker's error into a plain object with the queue it was working.
    const queue = typeof error === "object" && error !== null && "queue" in error ? error.queue : undefined;
    report(`pg-boss error${typeof queue === "string" ? ` on queue ${queue}` : ""}: ${describeError(error)}`);
  });
  boss.on("warning", (warning) => {
    // pg-boss's warnings are its own words about its own state (a slow query, a long queue), not a handler's data.
    report(`pg-boss warning: ${toError(warning).message}`);
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
      if (options.id !== undefined) assertJobId(options.id);
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
            // pg-boss stores what we throw, in a table without row-level security, so it gets a cut-down copy; the log
            // gets the queue, the job and the error's names and codes.
            report(`queue ${queue}, job ${job.id} failed: ${describeError(error)}`);
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

    async retryFailedJob(queue, jobId) {
      assertQueueName(queue);
      await boss.retry(queue, jobId);
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
          report(`failed job ${row.id} on queue ${row.name} can't be listed: ${describeError(error)}`);
        }
      }
      return failed;
    },
  };
}
