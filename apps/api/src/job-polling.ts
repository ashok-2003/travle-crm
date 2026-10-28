// How often the processes look for work when JOBS_POLLING_SECONDS is set: on a host that meters the traffic to the
// database (Render's free plan), pg-boss's 2-second polls of every queue cost more than everything else together. And
// which of them look at all: the api only sends.
import type { PgBossJobsSettings } from "@travel-crm/integrations/jobs";
import type { Environment } from "./environment.js";
import type { ProcessName } from "./process-name.js";

/** The longest pg-boss lets its scheduled sends wait between checks (node_modules/pg-boss/dist/attorney.js). */
const LONGEST_CRON_WORKER_INTERVAL_SECONDS = 45;

/** pg-boss's polls in every process: each queue's, and its scheduled sends' as far as pg-boss allows. Unset: its own. */
export function jobQueuePollingOf(
  environment: Pick<Environment, "JOBS_POLLING_SECONDS">,
): Pick<PgBossJobsSettings, "pollingIntervalSeconds" | "cronWorkerIntervalSeconds"> {
  const seconds = environment.JOBS_POLLING_SECONDS;
  if (seconds === undefined) return {};
  return {
    pollingIntervalSeconds: seconds,
    cronWorkerIntervalSeconds: Math.min(seconds, LONGEST_CRON_WORKER_INTERVAL_SECONDS),
  };
}

/**
 * The api sends jobs and works none: its pg-boss supervises no queue and keeps no schedule, so an idle api queries
 * nothing and a managed database that sleeps when idle can (docs/runbook.md, "Two small servers"). The worker and the
 * console supervise, keep the schedules and work the queues; in `api-and-worker` the worker is its own process.
 */
export function jobQueueRoleOf(processName: ProcessName): Pick<PgBossJobsSettings, "sendOnly"> {
  return processName === "api" ? { sendOnly: true } : {};
}

/** The outbox relay's wait after a pass that found nothing, in the worker. Unset: its own. */
export function relayPollingOf(environment: Pick<Environment, "JOBS_POLLING_SECONDS">): {
  relay?: { intervalMs: number };
} {
  const seconds = environment.JOBS_POLLING_SECONDS;
  return seconds === undefined ? {} : { relay: { intervalMs: seconds * 1000 } };
}
