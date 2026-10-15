// Entry point for the identity module only (dependency-cruiser enforces it). It reaches Better Auth's sign-in tables
// (user, session, account, verification, two_factor, organization, member, invitation), which have no row-level
// security because sign-in reads them before the organization is known.
import { createPrismaClient, ensureRuntimeRole, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
import { forOrg, hidingUnscopedModels, type ForOrgOptions, type IdentityTx, type UnscopedModel } from "./for-org.js";

export { isUniqueViolation } from "./errors.js";
export type { ForOrgOptions, IdentityTx } from "./for-org.js";

/**
 * For Better Auth's adapter and for sign-in lookups made before an organization is known. It sets no organization,
 * so organization-owned tables return no rows through it, and like every transaction it can't reach the tables
 * without organization_id (webhook events, rate-limit counters), which have no row-level security either. Its own
 * transactions are IdentityTx, and it can't be extended: an extension would skip its role check and that hiding.
 */
export type IdentityClient = Omit<DatabaseClient, UnscopedModel | "$transaction" | "$extends"> & {
  $transaction: IdentityTransaction;
};

/** Prisma's two forms of $transaction, with the interactive one's tx an IdentityTx. */
interface IdentityTransaction {
  /** An interactive transaction, as Better Auth's adapter runs them. */
  <Result>(fn: (tx: IdentityTx) => Promise<Result>, options?: ForOrgOptions): Promise<Result>;
  /** A batch of queries made on this client, which already refuses the unscoped models. */
  <Batch extends Prisma.PrismaPromise<unknown>[]>(
    batch: [...Batch],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<{ [Index in keyof Batch]: Awaited<Batch[Index]> }>;
}

/**
 * The client as the identity module gets it: the unscoped models refused, every interactive transaction's tx hidden
 * the same way, and $extends refused.
 */
function identityClientFrom(client: DatabaseClient): IdentityClient {
  const hidden = hidingUnscopedModels(client);
  const transaction = ((input: unknown, options?: ForOrgOptions) =>
    typeof input === "function"
      ? client.$transaction((tx) => (input as (tx: IdentityTx) => Promise<unknown>)(hidingUnscopedModels(tx)), options)
      : client.$transaction(input as Prisma.PrismaPromise<unknown>[], options)) as IdentityTransaction;
  return new Proxy(hidden, {
    get(target, property) {
      if (property === "$transaction") return transaction;
      if (property === "$extends") {
        throw new TypeError(
          "The identity client can't be extended: the result would skip its role check and its hiding of the " +
            "tables without row-level security",
        );
      }
      return Reflect.get(target, property) as unknown;
    },
  });
}

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
    client: identityClientFrom(client),
    forOrg: async (orgId, fn, options) => {
      await ensureRuntimeRole(client);
      return forOrg(client, orgId, fn, options);
    },
    disconnect: () => client.$disconnect(),
  };
}
