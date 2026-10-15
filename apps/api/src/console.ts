// Starts the platform console (`pnpm --filter @travel-crm/api-server console`): the console's tRPC at
// /api/platform/trpc, and the platform's own jobs. The api's image run as a third command, beside the api and the
// worker, and the only one given DATABASE_PLATFORM_URL (ADR 0019). One instance is enough; keep it running for the
// nightly demo reset.
import { serve } from "@hono/node-server";
import { createPlatformServices } from "@travel-crm/domain/platform";
import { describeError } from "@travel-crm/integrations/jobs";
import { createConsoleApp } from "./console-app.js";
import { loadConsoleSettings } from "./console-environment.js";
import { startConsoleJobs } from "./console-jobs.js";
import { startProcess } from "./start-up.js";

// The console's own start runs inside the start-up guard: its settings, the platform role's connection and its jobs.
// A missing DATABASE_PLATFORM_URL, a connection that isn't the platform role, or a schedule pg-boss refuses ends in
// one "console start-up failed" message, with the pools closed.
const { services, log, running } = await startProcess("console", async ({ environment, services, log }) => {
  const settings = loadConsoleSettings(process.env, environment);
  const platform = createPlatformServices({
    platformDatabaseUrl: settings.platformDatabaseUrl,
    db: services.db,
    identity: services.identity,
    storage: services.storage,
    queue: services.jobs,
    jobs: services.jobs,
    log,
  });
  try {
    // A transaction checks that the connection is the platform role: refuse to start rather than fail requests.
    await platform.platformDb.transaction(() => Promise.resolve());
    await startConsoleJobs(services.jobs, platform, settings.demo);
  } catch (error) {
    await platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return { settings, platform };
});
const { settings, platform } = running;

const server = serve({ fetch: createConsoleApp(platform, log).fetch, port: settings.port }, (address) => {
  console.log(`console listening on port ${String(address.port)}`);
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, let running jobs finish (pg-boss
// stops with the services), then close the pools. Exit 0 only when that went well.
function shutDown(): void {
  server.close((closeError) => {
    services
      .close()
      .then(() => platform.platformDb.disconnect())
      .then(() => {
        if (closeError) throw closeError;
        process.exit(0);
      })
      .catch((error: unknown) => {
        log(`shutdown failed: ${describeError(error)}`);
        process.exit(1);
      });
  });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
