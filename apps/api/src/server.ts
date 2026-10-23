// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { errorFields } from "@travel-crm/integrations/logging";
import { createApp } from "./app.js";
import { clientAddressFrom } from "./rate-limit.js";
import { metaSettingsOf, metaStartUpLine } from "./meta-settings.js";
import { whatsappStartUpLine } from "./whatsapp-settings.js";
import { sheetsStartUpLine } from "./sheets-settings.js";
import { assertServiceAccountsInPlace } from "./sheets-settings.js";
import { exitAfterLogs, startProcess, stopOnUnhandledErrors } from "./start-up.js";
import { webhookProvidersOf } from "./webhook-providers.js";

const { environment, services, logger } = await startProcess("api", async ({ services }) => {
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
  webhookProviders: webhookProvidersOf(services, logger),
  meta: services.meta,
  logger,
  authSecret: environment.BETTER_AUTH_SECRET,
  appUrl: environment.APP_URL,
  // environment.ts makes the keys a pair, so one is never set without the other.
  turnstile:
    services.botCheck !== null && environment.TURNSTILE_SITE_KEY !== undefined
      ? { botCheck: services.botCheck, siteKey: environment.TURNSTILE_SITE_KEY }
      : null,
  formAddress: {
    headerNames: environment.AUTH_IP_ADDRESS_HEADERS,
    trustedProxies: environment.AUTH_TRUSTED_PROXIES,
    proxyHops: environment.PUBLIC_FORM_PROXY_HOPS ?? null,
  },
});

const server = serve({ fetch: app.fetch, port: environment.PORT }, (address) => {
  logger.info({ port: address.port }, "api listening");
  const accounts = environment.GOOGLE_SHEETS_SERVICE_ACCOUNTS?.length ?? 0;
  logger.info({ serviceAccounts: accounts }, sheetsStartUpLine(accounts));
  logger.info({ meta: metaSettingsOf(environment) !== null }, metaStartUpLine(metaSettingsOf(environment)));
  logger.info({ whatsapp: services.whatsapp !== null }, whatsappStartUpLine(services.whatsapp?.settings ?? null));
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
        return exitAfterLogs(logger, exitCode);
      })
      .catch((error: unknown) => {
        logger.error(errorFields(error), "shutdown failed");
        return exitAfterLogs(logger, 1);
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
