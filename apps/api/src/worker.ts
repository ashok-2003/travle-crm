// Starts the worker (`pnpm --filter @travel-crm/api-server worker`): the api's image with no HTTP port. It relays the
// outbox and runs every listener, job and schedule (spec 9.1), connected as app_runtime like the api. Run more copies
// to go faster: pg-boss gives each job to one of them.
import { startWorker } from "@travel-crm/domain/jobs";
import { describeError } from "@travel-crm/integrations/jobs";
import { checkXlsxReading } from "@travel-crm/integrations/spreadsheets";
import { workerProblemLine } from "./process-log.js";
import { sheetsStartUpLine } from "./sheets-settings.js";
import { startProcess, stopOnUnhandledErrors } from "./start-up.js";
import { webhookProviders } from "./webhook-providers.js";
import { workerJobs } from "./worker-jobs.js";

// The worker's own start runs inside the start-up guard too: an .xlsx thread that can't run (ADR 0030), a repeated
// queue name or a schedule pg-boss refuses ends in one "worker start-up failed" message, with the pools closed.
const {
  environment,
  services,
  log,
  running: worker,
} = await startProcess("worker", async ({ environment, services, log }) => {
  await checkXlsxReading(services.spreadsheets);
  return startWorker({
    db: services.db,
    runner: services.jobs,
    queue: services.jobs,
    ...workerJobs({
      ...services,
      appUrl: environment.APP_URL,
      webhookProviders,
      log,
      ...(services.google === null || services.sheetsHashes === null
        ? {}
        : {
            sheets: {
              google: services.google,
              hashes: services.sheetsHashes,
              queue: services.jobs,
              ...(environment.SHEETS_CHECK_INTERVAL_SECONDS === undefined
                ? {}
                : { checkIntervalSeconds: environment.SHEETS_CHECK_INTERVAL_SECONDS }),
            },
          }),
    }),
    // The relay's errors, and jobs whose event wasn't found: the one log, a line each. pg-boss's problems and failing
    // jobs reach the same log through the services.
    onError: (problem) => {
      log(workerProblemLine(problem));
    },
  });
});
console.log("worker running");
console.log(sheetsStartUpLine(environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS?.length ?? 0));

// Container platforms send SIGTERM before stopping an instance: stop relaying, let running jobs finish, close the
// pools. Exit 0 only when that went well, so the platform can tell a clean stop from a failed one; 1 after an error
// nothing handled, which drains the same way.
function shutDown(exitCode: 0 | 1): void {
  worker
    .stop()
    .then(() => services.close())
    .then(() => process.exit(exitCode))
    .catch((error: unknown) => {
      log(`shutdown failed: ${describeError(error)}`);
      process.exit(1);
    });
}
process.on("SIGTERM", () => {
  shutDown(0);
});
process.on("SIGINT", () => {
  shutDown(0);
});
stopOnUnhandledErrors(log, shutDown);
