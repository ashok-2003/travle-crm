// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { defaultRetryPolicy } from "./retry-policy.js";

export interface PgBossJobsSettings {
  /** Postgres as the app_runtime role. */
  connectionString: string;
  /** Size of pg-boss's own connection pool. */
  maxConnections?: number;
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
  /** Where pg-boss's errors go: a failing maintenance query, a lost connection. */
  onError?: (error: Error) => void;
}

/** A job that used all its retries, for the platform console's failed-jobs list (plan 4). */
export interface FailedJob {
  id: string;
  queue: string;
  data: JobData;
  /** Every attempt, the first one included. */
  attempts: number;
  failedAt: Date;
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

interface FailedJobRow {
  id: string;
  name: string;
  data: unknown;
  retry_count: number;
  completed_on: Date | null;
  output: unknown;
}

/** Job data is a flat object of strings, numbers, booleans and nulls (the port's JobData); anything else is refused. */
function toJobData(value: unknown): JobData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
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
  boss.on("error", (error) => {
    if (settings.onError) settings.onError(error);
    else console.error("pg-boss error", error);
  });

  // pg-boss 12 needs a queue to exist before jobs are sent to or worked from it. Creating one is idempotent.
  const queues = new Map<string, Promise<void>>();
  function ensureQueue(name: string): Promise<void> {
    assertQueueName(name);
    let created = queues.get(name);
    if (!created) {
      created = boss.createQueue(name, {
        retryLimit: defaultRetryPolicy.retryLimit,
        retryDelay: defaultRetryPolicy.retryDelaySeconds,
        retryBackoff: true,
        retryDelayMax: defaultRetryPolicy.retryDelayMaxSeconds,
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
          if (job) await handler({ id: job.id, data: toJobData(job.data), retryCount: job.retryCount });
        },
      );
    },

    async schedule(queue, cron, { timeZone, data }) {
      await ensureQueue(queue);
      await boss.schedule(queue, cron, data ?? null, { tz: timeZone });
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
      const { rows } = await boss.getDb().executeSql(
        `SELECT id, name, data, retry_count, completed_on, output FROM ${SCHEMA}.job
         WHERE state = 'failed' ORDER BY completed_on DESC NULLS LAST LIMIT $1`,
        [limit],
      );
      return (rows as FailedJobRow[]).map((row) => ({
        id: row.id,
        queue: row.name,
        data: toJobData(row.data),
        attempts: row.retry_count + 1,
        failedAt: row.completed_on ?? new Date(0),
        error: errorMessageOf(row.output),
      }));
    },
  };
}
