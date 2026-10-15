// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { describeError } from "@travel-crm/integrations/jobs";
import { createApp } from "./app.js";
import { clientAddressFrom } from "./rate-limit.js";
import { startProcess } from "./start-up.js";
import { webhookProviders } from "./webhook-providers.js";

const { environment, services, log } = await startProcess("api", () => undefined);

const app = createApp({
  identity: services.identity,
  subscriptions: services.subscriptions,
  profiles: services.profiles,
  db: services.db,
  files: services.files,
  queue: services.jobs,
  rateLimiter: services.rateLimiter,
  clientAddress: clientAddressFrom({
    headerNames: environment.AUTH_IP_ADDRESS_HEADERS,
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
  }),
  webhookProviders,
  log,
});

const server = serve({ fetch: app.fetch, port: environment.PORT }, (address) => {
  console.log(`api listening on port ${String(address.port)}`);
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pools.
// Exit 0 only when that went well, so the platform can tell a clean stop from a failed one.
function shutDown(): void {
  server.close((closeError) => {
    services
      .close()
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
