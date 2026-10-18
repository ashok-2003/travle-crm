// What the platform console runs on, built once by the console process (apps/api's `console` command): the only
// process that holds DATABASE_PLATFORM_URL.
import type { Database } from "@travel-crm/db";
import {
  asOrganization,
  createPlatformDatabase,
  type ForOrgOptions,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
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
   * wrong after a commit with no one to tell. Required, so a process can't forget it; tests pass a collector.
   */
  log: (line: string) => void;
}

export interface PlatformServicesOptions extends Omit<PlatformServices, "platformDb"> {
  /** DATABASE_PLATFORM_URL: must connect as the app_platform role. */
  platformDatabaseUrl: string;
  /** Size of the platform role's connection pool. A handful is plenty: few people use the console. */
  maxConnections?: number;
  /** Each platform transaction's limits when the call names none (the api's DATABASE_TRANSACTION_* settings). */
  transactionLimits?: ForOrgOptions;
}

/** Connects the platform role. Close it with `services.platformDb.disconnect()`; the rest belong to the caller. */
export function createPlatformServices(options: PlatformServicesOptions): PlatformServices {
  const { platformDatabaseUrl, maxConnections, transactionLimits, ...shared } = options;
  return {
    ...shared,
    platformDb: createPlatformDatabase(platformDatabaseUrl, { maxConnections: maxConnections ?? 3, transactionLimits }),
  };
}

/** No organization has this id: the start-up check steps into it and runs nothing there. */
const NO_ORGANIZATION = "00000000-0000-7000-8000-000000000000";

/**
 * The platform role can't switch to app_runtime, so every step into an organization would fail (42501): onboarding,
 * an organization's details, the dashboard, exports and the demo. The deploy missed ADR 0019's grant.
 */
export class OrganizationStepRefusedError extends Error {
  constructor(options: { cause: unknown }) {
    super(
      "The platform role can't step into an organization as app_runtime. Run GRANT app_runtime TO app_platform " +
        "WITH INHERIT FALSE, SET TRUE on Postgres 16 or later, as a role with ADMIN OPTION on app_runtime " +
        "(ADR 0019, docs/deploy-checklist.md).",
      options,
    );
    this.name = "OrganizationStepRefusedError";
  }
}

/**
 * The console's start-up check, in one platform transaction: it commits only as the platform role
 * (WrongPlatformRoleError otherwise), and inside it an empty step into an organization switches to app_runtime and
 * back, running no query there. So a database without the grant stops the console at start-up, the one failure, rather
 * than let it start healthy and fail every step later.
 */
export async function checkPlatformConnection(platformDb: PlatformDatabase): Promise<void> {
  await platformDb.transaction(async (tx) => {
    try {
      await asOrganization(tx, NO_ORGANIZATION, () => Promise.resolve());
    } catch (error) {
      throw new OrganizationStepRefusedError({ cause: error });
    }
  });
}
