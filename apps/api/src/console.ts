// Starts the platform console (`pnpm --filter @travel-crm/api-server console`): the console's tRPC at
// /api/platform/trpc, and the platform's own jobs. The api's image run as a third command, beside the api and the
// worker, and the only one given DATABASE_PLATFORM_URL (ADR 0019). One instance is enough; keep it running for the
// nightly demo reset.
import { serve } from "@hono/node-server";
import { errorFields } from "@travel-crm/integrations/logging";
import { createConsoleApp } from "./console-app.js";
import { forgetServiceAccounts } from "./console-environment.js";
import { startConsoleJobs } from "./console-jobs.js";
import { startConsolePlatform } from "./console-platform.js";
import { startProcess, stopOnUnhandledErrors } from "./start-up.js";

// The console never holds the Google service accounts (SC5): dropped before anything reads the environment.
forgetServiceAccounts();

// The console's own start runs inside the start-up guard: its settings, the platform role's connection and its jobs.
// A missing DATABASE_PLATFORM_URL, a connection that isn't the platform role, or a schedule pg-boss refuses ends in
// one "console start-up failed" message, with the pools closed.
const { services, logger, running } = await startProcess("console", async (base) => {
  const started = await startConsolePlatform(base);
  try {
    await startConsoleJobs(base.services.jobs, started.platform, started.settings.demo);
  } catch (error) {
    await started.platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return started;
});
const { settings, platform } = running;

const server = serve({ fetch: createConsoleApp(platform, logger).fetch, port: settings.port }, (address) => {
  logger.info({ port: address.port }, "console listening");
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, let running jobs finish (pg-boss
// stops with the services, waiting up to 30 seconds), then close the pools. Exit 0 only when that went well; 1 after
// an error nothing handled, which drains the same way.
function shutDown(exitCode: 0 | 1): void {
  server.close((closeError) => {
    services
      .close()
      .then(() => platform.platformDb.disconnect())
      .then(() => {
        if (closeError) throw closeError;
        process.exit(exitCode);
      })
      .catch((error: unknown) => {
        logger.error(errorFields(error), "shutdown failed");
        process.exit(1);
      });
  });
}
process.on("SIGTERM", () => {
  shutDown(0);
});
process.on("SIGINT", () => {
  shutDown(0);
});
stopOnUnhandledErrors(logger, shutDown);
