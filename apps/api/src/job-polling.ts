// How often the processes look for work when JOBS_POLLING_SECONDS is set: on a host that meters the traffic to the
// database (Render's free plan), or whose database sleeps only after 5 idle minutes (Neon's, under the two small
// servers' working hours), pg-boss's polls and housekeeping are most of what the database sees. And which of them look
// at all: the api only sends, and so does the console with CONSOLE_JOBS off.
import type { PgBossJobsSettings } from "@travel-crm/integrations/jobs";
import type { Environment } from "./environment.js";
import type { ProcessName } from "./process-name.js";

/** The longest pg-boss lets its scheduled sends wait between checks (node_modules/pg-boss/dist/attorney.js). */
const LONGEST_CRON_WORKER_INTERVAL_SECONDS = 45;

/**
 * pg-boss's own housekeeping where JOBS_POLLING_SECONDS is set, slowed to what still does its job (docs/runbook.md,
 * "Working hours and night bursts", measures what each costs):
 * - flows (jobs that wait on other jobs) are never used here, so their check, every 5 seconds by default, runs hourly;
 * - supervision (a job past its time failed for a retry, old jobs deleted) and the queues' statistics every 5 minutes,
 *   and the cache of queues every 10 (a miss reads the database at once): every minute by default;
 * - the schedules' watchdog every 45 seconds, as seldom as pg-boss allows (30 by default);
 * - and running jobs get 2 minutes to finish when the process stops, since the working hours stop it every day.
 */
const QUIET_HOUSEKEEPING = {
  flowIntervalSeconds: 3600,
  superviseIntervalSeconds: 300,
  monitorIntervalSeconds: 300,
  queueCacheIntervalSeconds: 600,
  cronMonitorIntervalSeconds: 45,
  stopTimeoutSeconds: 120,
} as const satisfies Partial<PgBossJobsSettings>;

/** pg-boss's polls in every process: each queue's, its scheduled sends' as far as pg-boss allows, and its housekeeping. */
export function jobQueuePollingOf(
  environment: Pick<Environment, "JOBS_POLLING_SECONDS">,
): Pick<PgBossJobsSettings, "pollingIntervalSeconds" | "cronWorkerIntervalSeconds" | keyof typeof QUIET_HOUSEKEEPING> {
  const seconds = environment.JOBS_POLLING_SECONDS;
  if (seconds === undefined) return {};
  return {
    pollingIntervalSeconds: seconds,
    cronWorkerIntervalSeconds: Math.min(seconds, LONGEST_CRON_WORKER_INTERVAL_SECONDS),
    ...QUIET_HOUSEKEEPING,
  };
}

/** Whether the console runs its jobs (CONSOLE_JOBS), or only serves its pages. */
export function consoleRunsJobs(environment: Pick<Environment, "CONSOLE_JOBS">): boolean {
  return environment.CONSOLE_JOBS;
}

/**
 * The api sends jobs and works none: its pg-boss supervises no queue and keeps no schedule, so an idle api queries
 * nothing and a managed database that sleeps when idle can (docs/runbook.md, "Two small servers"). The console with its
 * jobs off is the same. The worker, and the console with its jobs, supervise, keep the schedules and work the queues; in
 * `api-and-worker` the worker is its own process.
 */
export function jobQueueRoleOf(
  processName: ProcessName,
  environment: Pick<Environment, "CONSOLE_JOBS">,
): Pick<PgBossJobsSettings, "sendOnly"> {
  const sendsOnly = processName === "api" || (processName === "console" && !consoleRunsJobs(environment));
  return sendsOnly ? { sendOnly: true } : {};
}

/** The outbox relay's wait after a pass that found nothing, in the worker. Unset: its own. */
export function relayPollingOf(environment: Pick<Environment, "JOBS_POLLING_SECONDS">): {
  relay?: { intervalMs: number };
} {
  const seconds = environment.JOBS_POLLING_SECONDS;
  return seconds === undefined ? {} : { relay: { intervalMs: seconds * 1000 } };
}
