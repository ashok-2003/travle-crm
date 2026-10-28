// How often the processes look for work when JOBS_POLLING_SECONDS is set: on a host that meters the traffic to the
// database (Render's free plan), pg-boss's 2-second polls of every queue cost more than everything else together.
import type { PgBossJobsSettings } from "@travel-crm/integrations/jobs";
import type { Environment } from "./environment.js";

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

/** The outbox relay's wait after a pass that found nothing, in the worker. Unset: its own. */
export function relayPollingOf(environment: Pick<Environment, "JOBS_POLLING_SECONDS">): {
  relay?: { intervalMs: number };
} {
  const seconds = environment.JOBS_POLLING_SECONDS;
  return seconds === undefined ? {} : { relay: { intervalMs: seconds * 1000 } };
}
