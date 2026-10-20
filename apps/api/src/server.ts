// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { describeError } from "@travel-crm/integrations/jobs";
import { createApp } from "./app.js";
import { clientAddressFrom } from "./rate-limit.js";
import { sheetsStartUpLine } from "./sheets-settings.js";
import { assertServiceAccountsInPlace } from "./sheets-settings.js";
import { startProcess, stopOnUnhandledErrors } from "./start-up.js";
import { webhookProviders } from "./webhook-providers.js";

const { environment, services, log } = await startProcess("api", async ({ services }) => {
  // The list of service accounts is the worker's to follow, but the api shows the address sheets are shared with: it
  // refuses a list that no longer holds one (SC9).
  if (services.google !== null) await assertServiceAccountsInPlace(services.db, services.google.accounts());
});

const app = createApp({
  identity: services.identity,
  // Only the api's request checks read what each organization may use today: the worker and the console never do.
  subscriptions: createSubscriptionAccess({ db: services.db }),
  profiles: services.profiles,
  db: services.db,
  files: services.files,
  // The browser learns it from notifications.push.publicKey, so no build of the web app carries a key.
  pushPublicKey: environment.VAPID_PUBLIC_KEY,
  google: services.google,
  sheetsHashes: services.sheetsHashes,
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
  console.log(sheetsStartUpLine(environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS?.length ?? 0));
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pools.
// Exit 0 only when that went well, so the platform can tell a clean stop from a failed one; 1 after an error nothing
// handled, which drains the same way.
function shutDown(exitCode: 0 | 1): void {
  server.close((closeError) => {
    services
      .close()
      .then(() => {
        if (closeError) throw closeError;
        process.exit(exitCode);
      })
      .catch((error: unknown) => {
        log(`shutdown failed: ${describeError(error)}`);
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
stopOnUnhandledErrors(log, shutDown);
