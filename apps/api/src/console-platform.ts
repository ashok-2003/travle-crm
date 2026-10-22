// The console's platform services on a started process (ADR 0019): its own settings, and the platform role's
// connection, checked before anything uses it. The console process and its one-off commands start the same way.
import { checkPlatformConnection, createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import { createSheetsHashes } from "@travel-crm/domain/sheets";
import { loadConsoleSettings, type ConsoleSettings } from "./console-environment.js";
import { transactionLimitsOf } from "./services.js";
import type { ProcessBase } from "./start-up.js";

export interface ConsolePlatform {
  settings: ConsoleSettings;
  platform: PlatformServices;
}

/**
 * A missing DATABASE_PLATFORM_URL, a connection that isn't the platform role, or a platform role that can't step into
 * an organization (the grant a hosted database needs) throws, with the platform pool closed.
 */
export async function startConsolePlatform({ environment, services, logger }: ProcessBase): Promise<ConsolePlatform> {
  const settings = loadConsoleSettings(process.env, environment);
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
  });
  try {
    // The connection is the platform role, and may switch to the runtime role: refuse to start rather than fail later.
    await checkPlatformConnection(platform.platformDb);
  } catch (error) {
    await platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return { settings, platform };
}
