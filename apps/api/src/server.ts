// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnvironment } from "./environment.js";
import { clientAddressFrom } from "./rate-limit.js";
import { createServices, type Services } from "./services.js";

const environment = loadEnvironment(process.env);

/**
 * Builds and starts what the api runs on, or exits 1: a bucket the api can't use, a database pg-boss can't reach, or
 * adapters that can't be built (a VAPID private key that isn't the public key's) all end here, with one message.
 */
async function startedServices(): Promise<Services> {
  let services: Services | undefined;
  try {
    services = createServices(environment);
    await services.start();
    return services;
  } catch (error) {
    console.error("api start-up failed", error);
    await services?.close().catch((closeError: unknown) => {
      console.error("closing the pools after the failed start-up failed too", closeError);
    });
    process.exit(1);
  }
}

const services = await startedServices();

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
