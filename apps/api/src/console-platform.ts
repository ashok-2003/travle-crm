// The console's platform services on a started process (ADR 0019): its own settings, and the platform role's
// connection, checked before anything uses it. The console process and its one-off commands start the same way.
import { checkPlatformConnection, createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import { createSheetsHashes } from "@travel-crm/domain/sheets";
import { WHATSAPP_WEBHOOK_HEADER } from "@travel-crm/integrations/whatsapp";
import type { ConsolePublicRoutes } from "./console-app.js";
import { loadConsoleSettings, type ConsoleSettings } from "./console-environment.js";
import { clientAddressFrom } from "./rate-limit.js";
import { transactionLimitsOf } from "./services.js";
import type { ProcessBase } from "./start-up.js";

export interface ConsolePlatform {
  settings: ConsoleSettings;
  platform: PlatformServices;
  /** For the invite links' public route: the limiter and who is asking. */
  publicRoutes: ConsolePublicRoutes;
}

/**
 * A missing DATABASE_PLATFORM_URL, a connection that isn't the platform role, or a platform role that can't step into
 * an organization (the grant a hosted database needs) throws, with the platform pool closed.
 */
export async function startConsolePlatform({ environment, services, logger }: ProcessBase): Promise<ConsolePlatform> {
  const settings = loadConsoleSettings(process.env, environment);
  const whatsapp = services.whatsapp ?? null;
  const platform = createPlatformServices({
    platformDatabaseUrl: settings.platformDatabaseUrl,
    transactionLimits: transactionLimitsOf(environment),
    db: services.db,
    identity: services.identity,
    storage: services.storage,
    queue: services.jobs,
    jobs: services.jobs,
    // The erasure of a customer of an agency with sheets keeps keyed hashes of their rows and contacts (S43, S6).
    sheetsHashes: settings.sheetsHashKey === null ? null : createSheetsHashes(settings.sheetsHashKey),
    logger,
    // The invite program's links are the web app's.
    appUrl: environment.APP_URL,
    aiPrices:
      environment.AI_PRICE_INPUT_PAISE_PER_MILLION === undefined ||
      environment.AI_PRICE_OUTPUT_PAISE_PER_MILLION === undefined
        ? null
        : {
            inputPaisePerMillion: environment.AI_PRICE_INPUT_PAISE_PER_MILLION,
            outputPaisePerMillion: environment.AI_PRICE_OUTPUT_PAISE_PER_MILLION,
          },
    // The webhook block and the provider for "Check with MSG91" (ADR 0035): from the process settings, never the database.
    whatsapp:
      whatsapp === null
        ? null
        : {
            provider: whatsapp.provider,
            webhookUrl: `${environment.BETTER_AUTH_URL.replace(/\/$/, "")}/webhooks/msg91-whatsapp/${whatsapp.settings.webhookToken}`,
            webhookHeaderName: WHATSAPP_WEBHOOK_HEADER,
            webhookHeaderValue: whatsapp.settings.webhookKey,
          },
  });
  try {
    // The connection is the platform role, and may switch to the runtime role: refuse to start rather than fail later.
    await checkPlatformConnection(platform.platformDb);
  } catch (error) {
    await platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return {
    settings,
    platform,
    publicRoutes: {
      rateLimiter: services.rateLimiter,
      clientAddress: clientAddressFrom({
        headerNames: environment.AUTH_IP_ADDRESS_HEADERS,
        trustedProxies: environment.AUTH_TRUSTED_PROXIES,
      }),
    },
  };
}
