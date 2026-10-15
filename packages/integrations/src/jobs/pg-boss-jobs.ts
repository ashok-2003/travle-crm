// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { describeError } from "./describe-error.js";
import type { JobAdministration } from "./job-administration.js";
import { assertJobId, assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { failedJobsPage, toJobData } from "./pg-boss-failed-jobs.js";
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

export interface PgBossJobs extends JobQueue, JobRunner, JobAdministration {
  start(): Promise<void>;
  /** Stops taking jobs, waits up to 30 seconds for running handlers to finish, and closes the pool. */
  stop(): Promise<void>;
}

/** The schema our migrations create pg-boss in (migration 20261015100000_pgboss). */
const SCHEMA = "pgboss";

/** The longest an attempt may run: pg-boss refuses more (node_modules/pg-boss/dist/attorney.js, MAX_EXPIRATION_HOURS). */
const MAX_EXPIRE_IN_SECONDS = 24 * 60 * 60;

/** The code of pg-boss's error for a queue that doesn't exist (node_modules/pg-boss/dist/manager.js). */
const QUEUE_NOT_FOUND = "PGBOSS_QUEUE_NOT_FOUND";

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
      const { expireInSeconds } = options;
      if (
        expireInSeconds !== undefined &&
        (!Number.isInteger(expireInSeconds) || expireInSeconds < 1 || expireInSeconds > MAX_EXPIRE_IN_SECONDS)
      ) {
        throw new RangeError(`expireInSeconds must be a whole number from 1 to ${String(MAX_EXPIRE_IN_SECONDS)}`);
      }
      await ensureQueue(queue);
      return boss.send(queue, data, {
        ...(options.id === undefined ? {} : { id: options.id }),
        ...(options.startAfter === undefined ? {} : { startAfter: options.startAfter }),
        ...(expireInSeconds === undefined ? {} : { expireInSeconds }),
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
      assertJobId(jobId);
      try {
        // pg-boss's typings leave the response's fields out; it counts the jobs it moved (manager.js,
        // mapCommandResponse): none when the job isn't failed, or not any more.
        const response = (await boss.retry(queue, jobId)) as { affected?: number };
        return (response.affected ?? 0) > 0;
      } catch (error) {
        // A queue nobody ever created (manager.js, getQueueCache).
        if (typeof error === "object" && error !== null && "code" in error && error.code === QUEUE_NOT_FOUND) {
          return false;
        }
        throw error;
      }
    },

    async schedules() {
      return (await boss.getSchedules()).map((schedule) => ({
        queue: schedule.name,
        cron: schedule.cron,
        timeZone: schedule.timezone,
      }));
    },

    failedJobs: (options = {}) => failedJobsPage(boss, SCHEMA, options, report),
  };
}
