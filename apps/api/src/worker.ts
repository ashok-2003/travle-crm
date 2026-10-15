// Starts the worker (`pnpm --filter @travel-crm/api-server worker`): the api's image with no HTTP port. It relays the
// outbox and runs every listener, job and schedule (spec 9.1), connected as app_runtime like the api. Run more copies
// to go faster: pg-boss gives each job to one of them.
import { startWorker } from "@travel-crm/domain/jobs";
import { sanitizeJobError } from "@travel-crm/integrations/jobs";
import { loadEnvironment } from "./environment.js";
import { startedServices } from "./start-up.js";
import { webhookProviders } from "./webhook-providers.js";
import { workerJobs } from "./worker-jobs.js";

const environment = loadEnvironment(process.env);
const services = await startedServices(environment, "worker");

/** The worker's log: one line per problem. Listeners write ids and codes only; errors are cut down the same way. */
const log = (line: string) => {
  console.error(`worker: ${line}`);
};

const worker = await startWorker({
  db: services.db,
  runner: services.jobs,
  queue: services.jobs,
  ...workerJobs({ ...services, appUrl: environment.APP_URL, webhookProviders, log }),
  // The relay's errors, and jobs whose event wasn't found: the same log, masked as pg-boss's stored errors are.
  onError: (error) => {
    log(sanitizeJobError(error).message);
  },
});
console.log("worker running");

// Container platforms send SIGTERM before stopping an instance: stop relaying, let running jobs finish, close the
// pools. Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
function shutDown(): void {
  worker
    .stop()
    .then(() => services.close())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error("worker shutdown failed", error);
      process.exit(1);
    });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
