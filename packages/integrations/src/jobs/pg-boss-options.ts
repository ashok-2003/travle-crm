// What a pg-boss instance is built with: our settings, and the pg-boss options they come to. A send-only instance (the
// api's) runs none of pg-boss's loops, so an idle api asks the database nothing and a managed one can sleep.
import type { ConstructorOptions } from "pg-boss";
import type { Logger } from "../logging/index.js";
import type { RetryPolicy } from "./retry-policy.js";

export interface PgBossJobsSettings {
  /** Postgres as the app_runtime role. */
  connectionString: string;
  /** Size of pg-boss's own connection pool. */
  maxConnections?: number;
  /** Seconds between a worker's checks for new jobs (pg-boss's default is 2). */
  pollingIntervalSeconds?: number;
  /** Seconds between pg-boss's checks for scheduled jobs due to be sent: 1 to 45 (pg-boss's default is 5). */
  cronWorkerIntervalSeconds?: number;
  /** Seconds between pg-boss's watchdog checks that its schedules run: 1 to 45 (pg-boss's default is 30). */
  cronMonitorIntervalSeconds?: number;
  /**
   * Seconds between pg-boss's checks for flows to advance (jobs that wait on other jobs; pg-boss's default is 5). We use
   * no flows, so the check finds nothing.
   */
  flowIntervalSeconds?: number;
  /** Seconds between pg-boss's supervision (jobs past their time failed for a retry, old ones deleted): default 60. */
  superviseIntervalSeconds?: number;
  /** Seconds between pg-boss's queue statistics and its warnings about long queues: default 60. */
  monitorIntervalSeconds?: number;
  /** Seconds between reads of pg-boss's cache of queues (a miss reads the database at once): default 60. */
  queueCacheIntervalSeconds?: number;
  /** Seconds between the heartbeats of pg-boss's instance registry (getInstances, for monitoring): 1 to 3600, default 30. */
  instanceHeartbeatSeconds?: number;
  /** Seconds stop() waits for running handlers before it closes the pool under them (default 30). */
  stopTimeoutSeconds?: number;
  /**
   * The instance only sends jobs: it supervises no queue, keeps no schedule, stays out of pg-boss's instance registry
   * (whose heartbeat writes every 30 seconds) and reads its cache of queues once a day, so it queries nothing while
   * idle. The instances that work the queues (the worker's, the console's) keep supervising, scheduling and their
   * registry row. Its own `work()` and `schedule()` still work, but nothing sends a schedule's jobs on its behalf.
   */
  sendOnly?: boolean;
  /** How the queues this instance creates retry failed jobs. Tests shorten it; production keeps the default. */
  retryPolicy?: RetryPolicy;
  /**
   * The structured log (ADR 0032). Each job a handler runs gets a `debug` line when it starts and an `info` line when it
   * ends, with its queue, job id, organization (when its data names one), retry count and duration; a failing handler
   * gets an `error` line with the error's name, code and frames. pg-boss's own errors (a failing maintenance query, a
   * lost connection; with the queue when pg-boss names one) are `error` lines, its warnings `warn` lines in its own
   * words, and failed-job rows that couldn't be read `warn` lines. Errors never show their messages, which can quote
   * personal data. Without it, warnings and errors go to standard output as JSON.
   */
  logger?: Logger;
}

/** The schema our migrations create pg-boss in (migration 20261015100000_pgboss). */
export const SCHEMA = "pgboss";

/** The longest pg-boss lets its cache of queues go unread, in seconds (node_modules/pg-boss/dist/attorney.js). */
const LONGEST_QUEUE_CACHE_INTERVAL_SECONDS = 24 * 60 * 60;

export function pgBossOptionsOf(settings: PgBossJobsSettings): ConstructorOptions {
  return {
    connectionString: settings.connectionString,
    schema: SCHEMA,
    max: settings.maxConnections ?? 5,
    // Our migrations own pg-boss's schema; the runtime role may not change it.
    migrate: false,
    createSchema: false,
    ...(settings.cronWorkerIntervalSeconds === undefined
      ? {}
      : { cronWorkerIntervalSeconds: settings.cronWorkerIntervalSeconds }),
    ...(settings.cronMonitorIntervalSeconds === undefined
      ? {}
      : { cronMonitorIntervalSeconds: settings.cronMonitorIntervalSeconds }),
    ...(settings.flowIntervalSeconds === undefined ? {} : { flowIntervalSeconds: settings.flowIntervalSeconds }),
    ...(settings.superviseIntervalSeconds === undefined
      ? {}
      : { superviseIntervalSeconds: settings.superviseIntervalSeconds }),
    ...(settings.monitorIntervalSeconds === undefined
      ? {}
      : { monitorIntervalSeconds: settings.monitorIntervalSeconds }),
    ...(settings.queueCacheIntervalSeconds === undefined
      ? {}
      : { queueCacheIntervalSeconds: settings.queueCacheIntervalSeconds }),
    ...(settings.instanceHeartbeatSeconds === undefined
      ? {}
      : { instanceHeartbeatSeconds: settings.instanceHeartbeatSeconds }),
    // Last, so a send-only instance reads its cache of queues once a day whatever else it is given.
    ...(settings.sendOnly === true
      ? {
          supervise: false,
          schedule: false,
          registerInstance: false,
          queueCacheIntervalSeconds: LONGEST_QUEUE_CACHE_INTERVAL_SECONDS,
        }
      : {}),
  };
}
