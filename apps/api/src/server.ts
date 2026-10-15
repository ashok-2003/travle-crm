// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnvironment } from "./environment.js";
import { clientAddressFrom } from "./rate-limit.js";
import { createServices } from "./services.js";

const environment = loadEnvironment(process.env);
const services = createServices(environment);
try {
  await services.start();
} catch (error) {
  // A bucket the api can't use, or a database pg-boss can't reach: don't serve requests that would fail.
  console.error("api start-up failed", error);
  await services.close().catch(() => undefined);
  process.exit(1);
}

const app = createApp({
  identity: services.identity,
  db: services.db,
  files: services.files,
  queue: services.jobs,
  rateLimiter: services.rateLimiter,
  clientAddress: clientAddressFrom({
    headerNames: environment.AUTH_IP_ADDRESS_HEADERS,
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
  }),
  webhookProviders: [],
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
        console.error("api shutdown failed", error);
        process.exit(1);
      });
  });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
