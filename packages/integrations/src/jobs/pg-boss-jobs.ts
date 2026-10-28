// The jobs port on pg-boss (spec 9.1): queues in Postgres, no extra server. pg-boss runs as app_runtime with
// migrate: false; its schema comes from our migrations (ADR 0010).
import { PgBoss } from "pg-boss";
import { createPinoLogger, errorFields, type LogFields, type LogLevel } from "../logging/index.js";
import type { JobAdministration } from "./job-administration.js";
import { assertJobId, assertQueueName, type JobData, type JobQueue } from "./job-queue.js";
import type { JobRunner } from "./job-runner.js";
import { failedJobsPage, toJobData } from "./pg-boss-failed-jobs.js";
import { pgBossOptionsOf, SCHEMA, type PgBossJobsSettings } from "./pg-boss-options.js";
import { defaultRetryPolicy } from "./retry-policy.js";
import { sanitizeJobError, toError } from "./sanitize-job-error.js";

export type { PgBossJobsSettings } from "./pg-boss-options.js";

export interface PgBossJobs extends JobQueue, JobRunner, JobAdministration {
  start(): Promise<void>;
  /** Stops taking jobs, waits up to 30 seconds for running handlers to finish, and closes the pool. */
  stop(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The organization a job's data names, for its log lines (job data holds ids only). */
function organizationOf(data: unknown): { organizationId?: string } {
  const organizationId =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>).organizationId : undefined;
  return typeof organizationId === "string" && UUID.test(organizationId) ? { organizationId } : {};
}

/** The longest an attempt may run: pg-boss refuses more (node_modules/pg-boss/dist/attorney.js, MAX_EXPIRATION_HOURS). */
const MAX_EXPIRE_IN_SECONDS = 24 * 60 * 60;

/** The code of pg-boss's error for a queue that doesn't exist (node_modules/pg-boss/dist/manager.js). */
const QUEUE_NOT_FOUND = "PGBOSS_QUEUE_NOT_FOUND";

export function createPgBossJobs(settings: PgBossJobsSettings): PgBossJobs {
  const boss = new PgBoss(pgBossOptionsOf(settings));
  const logger = settings.logger ?? createPinoLogger({ process: "jobs", level: "warn" });
  function report(level: LogLevel, fields: LogFields, message: string): void {
    try {
      logger[level](fields, message);
    } catch {
      // A broken logger must not break pg-boss's loops, nor replace the sanitised error it stores.
    }
  }
  boss.on("error", (error: unknown) => {
    // pg-boss spreads a worker's error into a plain object with the queue it was working.
    const queue = typeof error === "object" && error !== null && "queue" in error ? error.queue : undefined;
    report(
      "error",
      { source: "pg-boss", ...(typeof queue === "string" ? { queue } : {}), ...errorFields(error) },
      "pg-boss error",
    );
  });
  boss.on("warning", (warning) => {
    // pg-boss's warnings are its own words about its own state (a slow query, a long queue), not a handler's data.
    report("warn", { source: "pg-boss" }, `pg-boss warning: ${toError(warning).message}`);
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
          const started = performance.now();
          const fields: LogFields = { queue, jobId: job.id, retryCount: job.retryCount, ...organizationOf(job.data) };
          report("debug", fields, "job started");
          try {
            await handler({ id: job.id, data: toJobData(job.data), retryCount: job.retryCount });
            report(
              "info",
              { ...fields, durationMs: Math.round(performance.now() - started), outcome: "done" },
              "job finished",
            );
          } catch (error) {
            // pg-boss stores what we throw, in a table without row-level security, so it gets a cut-down copy; the log
            // gets the queue, the job and the error's names, code and frames.
            const durationMs = Math.round(performance.now() - started);
            report("error", { ...fields, durationMs, outcome: "failed", ...errorFields(error) }, "job failed");
            throw sanitizeJobError(error);
          }
        },
      );
    },

    async schedule(queue, cron, { timeZone, data }) {
      await ensureQueue(queue);
      // A run that came due while no worker ran (a deploy, the night a daytime-only worker is stopped) is sent once
      // when one runs again, however many were missed: every schedule's job works out what is due from the time it
      // runs, so a late run catches up and a second one would find nothing.
      await boss.schedule(queue, cron, data ?? {}, { tz: timeZone, missed: "once" });
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

    failedJobs: (options = {}) =>
      failedJobsPage(boss, SCHEMA, options, (jobId, queue, error) => {
        report("warn", { source: "pg-boss", jobId, queue, ...errorFields(error) }, "A failed job can't be listed");
      }),
  };
}
