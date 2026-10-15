// The console's platform services on a started process (ADR 0019): its own settings, and the platform role's
// connection, checked before anything uses it. The console process and its one-off commands start the same way.
import { createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import { loadConsoleSettings, type ConsoleSettings } from "./console-environment.js";
import type { ProcessBase } from "./start-up.js";

export interface ConsolePlatform {
  settings: ConsoleSettings;
  platform: PlatformServices;
}

/** A missing DATABASE_PLATFORM_URL or a connection that isn't the platform role throws, with the platform pool closed. */
export async function startConsolePlatform({ environment, services, log }: ProcessBase): Promise<ConsolePlatform> {
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
    // A transaction checks that the connection is the platform role: refuse to start rather than fail later.
    await platform.platformDb.transaction(() => Promise.resolve());
  } catch (error) {
    await platform.platformDb.disconnect().catch(() => undefined);
    throw error;
  }
  return { settings, platform };
}
