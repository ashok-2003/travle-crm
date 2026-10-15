// Entry point for the identity module only (dependency-cruiser enforces it). It reaches Better Auth's sign-in tables
// (user, session, account, verification, two_factor, organization, member, invitation), which have no row-level
// security because sign-in reads them before the organization is known.
import { createPrismaClient, ensureRuntimeRole, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import { forOrg, hidingUnscopedModels, type ForOrgOptions, type IdentityTx, type UnscopedModel } from "./for-org.js";

export { isUniqueViolation } from "./errors.js";
export type { ForOrgOptions, IdentityTx } from "./for-org.js";

/**
 * For Better Auth's adapter and for sign-in lookups made before an organization is known. It sets no organization,
 * so organization-owned tables return no rows through it, and like every transaction it can't reach the tables
 * without organization_id (webhook events, rate-limit counters), which have no row-level security either.
 */
export type IdentityClient = Omit<DatabaseClient, UnscopedModel>;

export interface IdentityDatabase {
  readonly client: IdentityClient;
  /** Like db.forOrg(), but the transaction can also reach the sign-in tables. Filter them by organization yourself. */
  forOrg<T>(orgId: string, fn: (tx: IdentityTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** Connects as the app_runtime role, like createDatabase(). */
export function createIdentityDatabase(url: string, options: DatabaseOptions = {}): IdentityDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 10, requireRuntimeRole: true });
  return {
    // Better Auth touches only its own models. The role check and forOrg() below keep the unwrapped client: the check
    // is looked up by the client itself.
    client: hidingUnscopedModels(client),
    forOrg: async (orgId, fn, options) => {
      await ensureRuntimeRole(client);
      return forOrg(client, orgId, fn, options);
    },
    disconnect: () => client.$disconnect(),
  };
}
