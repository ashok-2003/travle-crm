// Starts the worker (`pnpm --filter @travel-crm/api-server worker`): the api's image with no HTTP port. It relays the
// outbox and runs every listener, job and schedule (spec 9.1), connected as app_runtime like the api. Run more copies
// to go faster: pg-boss gives each job to one of them.
import { startWorker } from "@travel-crm/domain/jobs";
import { errorFields } from "@travel-crm/integrations/logging";
import { reconcileScheduleAccounts } from "@travel-crm/domain/sheets";
import { checkXlsxReading } from "@travel-crm/integrations/spreadsheets";
import { metaSettingsOf, metaStartUpLine } from "./meta-settings.js";
import { whatsappStartUpLine } from "./whatsapp-settings.js";
import { assertServiceAccountsInPlace, sheetsStartUpLine } from "./sheets-settings.js";
import { exitAfterLogs, startProcess, stopOnUnhandledErrors } from "./start-up.js";
import { webhookProvidersOf } from "./webhook-providers.js";
import { workerJobs } from "./worker-jobs.js";
import { logWorkerProblem } from "./worker-problem.js";

// The worker's own start runs inside the start-up guard too: an .xlsx thread that can't run (ADR 0030), a repeated
// queue name or a schedule pg-boss refuses ends in one "worker start-up failed" message, with the pools closed.
const {
  environment,
  services,
  logger,
  running: worker,
} = await startProcess("worker", async ({ environment, services, logger }) => {
  await checkXlsxReading(services.spreadsheets);
  if (services.google !== null) {
    // A reordered list is followed by address; an account taken out stops the worker here.
    await reconcileScheduleAccounts(services.db, services.google.accounts());
    await assertServiceAccountsInPlace(services.db, services.google.accounts());
  }
  return startWorker({
    db: services.db,
    runner: services.jobs,
    queue: services.jobs,
    ...workerJobs({
      ...services,
      appUrl: environment.APP_URL,
      webhookProviders: webhookProvidersOf(services, logger),
      logger,
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
    logger,
    // The relay's errors, and jobs whose event wasn't found: a line each. pg-boss's problems and failing jobs reach the
    // same log through the services.
    onError: logWorkerProblem(logger),
  });
});
const accounts = environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS?.length ?? 0;
logger.info({ serviceAccounts: accounts }, "worker running");
logger.info({ serviceAccounts: accounts }, sheetsStartUpLine(accounts));
logger.info({ meta: metaSettingsOf(environment) !== null }, metaStartUpLine(metaSettingsOf(environment)));
logger.info({ whatsapp: services.whatsapp !== null }, whatsappStartUpLine(services.whatsapp?.settings ?? null));

// Container platforms send SIGTERM before stopping an instance: stop relaying, let running jobs finish, close the
// pools. Exit 0 only when that went well, so the platform can tell a clean stop from a failed one; 1 after an error
// nothing handled, which drains the same way.
function shutDown(exitCode: 0 | 1): void {
  worker
    .stop()
    .then(() => services.close())
    .then(() => exitAfterLogs(logger, exitCode))
    .catch((error: unknown) => {
      logger.error(errorFields(error), "shutdown failed");
      return exitAfterLogs(logger, 1);
    });
}
process.on("SIGTERM", () => {
  shutDown(0);
});
process.on("SIGINT", () => {
  shutDown(0);
});
stopOnUnhandledErrors(logger, shutDown);
