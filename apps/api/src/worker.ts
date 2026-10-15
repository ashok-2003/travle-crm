// Starts the worker (`pnpm --filter @travel-crm/api-server worker`): the api's image with no HTTP port. It relays the
// outbox and runs every listener, job and schedule (spec 9.1), connected as app_runtime like the api. Run more copies
// to go faster: pg-boss gives each job to one of them.
import { startWorker } from "@travel-crm/domain/jobs";
import { describeError } from "@travel-crm/integrations/jobs";
import { workerProblemLine } from "./process-log.js";
import { startProcess } from "./start-up.js";
import { webhookProviders } from "./webhook-providers.js";
import { workerJobs } from "./worker-jobs.js";

// The worker's own start runs inside the start-up guard too: a repeated queue name or a schedule pg-boss refuses ends
// in one "worker start-up failed" message, with the pools closed.
const {
  services,
  log,
  running: worker,
} = await startProcess("worker", ({ environment, services, log }) =>
  startWorker({
    db: services.db,
    runner: services.jobs,
    queue: services.jobs,
    ...workerJobs({ ...services, appUrl: environment.APP_URL, webhookProviders, log }),
    // The relay's errors, and jobs whose event wasn't found: the one log, a line each. pg-boss's problems and failing
    // jobs reach the same log through the services.
    onError: (problem) => {
      log(workerProblemLine(problem));
    },
  }),
);
console.log("worker running");

// Container platforms send SIGTERM before stopping an instance: stop relaying, let running jobs finish, close the
// pools. Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
function shutDown(): void {
  worker
    .stop()
    .then(() => services.close())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      log(`shutdown failed: ${describeError(error)}`);
      process.exit(1);
    });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
