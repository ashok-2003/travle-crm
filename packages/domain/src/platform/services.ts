// What the platform console runs on, built once by the console process (apps/api's `console` command): the only
// process that holds DATABASE_PLATFORM_URL.
import type { Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import type { JobAdministration, JobQueue } from "@travel-crm/integrations/jobs";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { Identity } from "../identity/index.js";

export interface PlatformServices {
  /** The platform role: every organization, in transactions that can step into one (asOrganization). */
  platformDb: PlatformDatabase;
  /** The runtime role, for work in one organization that needs no platform rights. */
  db: Database;
  /** Sessions, platform staff and everything else about sign-in. */
  identity: Identity;
  /** Object storage, where organizations' files are kept. */
  storage: ObjectStorage;
  /** Where the console queues the platform's own jobs. */
  queue: JobQueue;
  /** Every process's failed jobs and schedules, for the console's failed-jobs list (spec 9.1). */
  jobs: JobAdministration;
  /**
   * The console process's log, a line each, ids and codes only (errors as describeError gives them), for what goes
   * wrong after a commit with no one to tell. The console passes its own; tests may leave it out.
   */
  log?: (line: string) => void;
}

export interface PlatformServicesOptions extends Omit<PlatformServices, "platformDb"> {
  /** DATABASE_PLATFORM_URL: must connect as the app_platform role. */
  platformDatabaseUrl: string;
  /** Size of the platform role's connection pool. A handful is plenty: few people use the console. */
  maxConnections?: number;
}

/** Connects the platform role. Close it with `services.platformDb.disconnect()`; the rest belong to the caller. */
export function createPlatformServices(options: PlatformServicesOptions): PlatformServices {
  const { platformDatabaseUrl, maxConnections, ...shared } = options;
  return {
    ...shared,
    platformDb: createPlatformDatabase(platformDatabaseUrl, { maxConnections: maxConnections ?? 3 }),
  };
}
