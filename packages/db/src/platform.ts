// Entry point for the platform module only (dependency-cruiser enforces it, tests aside): transactions as the
// app_platform role, which sees every organization (platform_access policy), and, inside one, a step into a single
// organization as app_runtime, where row-level security and the runtime role's grants apply as in db.forOrg().
import { AsyncLocalStorage } from "node:async_hooks";
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import { NestedForOrgError, WrongPlatformRoleError } from "./errors.js";
import {
  allowUnscopedModels,
  assertOrganizationId,
  enterTransaction,
  hidingUnscopedModels,
  type ForOrgOptions,
  type IdentityTx,
  type TransactionClient,
} from "./for-org.js";

export { WrongPlatformRoleError } from "./errors.js";
export { deleteOrganizationRows, organizationRows } from "./organization-rows.js";
export type { ForOrgOptions, IdentityTx, OrgTx } from "./for-org.js";

export type PlatformClient = DatabaseClient;

/**
 * A transaction as app_platform: every model, the sign-in tables and the tables without organization_id included, and
 * every organization's rows. Nothing scopes it, so every query names the organization it means.
 */
export type PlatformTx = TransactionClient;

export interface PlatformDatabase {
  /** Runs fn in one transaction as app_platform. Like forOrg(), it can't be nested in another transaction. */
  transaction<T>(fn: (tx: PlatformTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** A plain client as the app_platform role, for tests that set up data. Never use it for requests. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}

/** Connects as the app_platform role. Only the platform console holds this URL; the api and worker never do. */
export function createPlatformDatabase(url: string, options: DatabaseOptions = {}): PlatformDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 5 });
  return {
    transaction: (fn, transactionOptions = {}) =>
      enterTransaction(() =>
        client.$transaction(async (tx) => {
          const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
          if (session?.role !== "app_platform") throw new WrongPlatformRoleError(session?.role);
          // The platform role reads and writes webhook events itself (tombstones after a purge).
          allowUnscopedModels(tx, tx);
          return fn(tx);
        }, transactionOptions),
      ),
    disconnect: () => client.$disconnect(),
  };
}

/** Set while asOrganization() runs, to refuse a second organization inside it. */
const insideOrganization = new AsyncLocalStorage<true>();

/**
 * Inside a platform transaction, runs fn as app_runtime in one organization: row-level security limits every query to
 * it, new rows take its id by default, and only the runtime role's grants apply, exactly as in db.forOrg(). So module
 * code written for forOrg() runs unchanged, in the same transaction as the platform's own writes. Afterwards the
 * transaction is the platform role again, with no organization set, even when fn failed. It can't be nested.
 */
export async function asOrganization<T>(
  tx: PlatformTx,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  assertOrganizationId(organizationId);
  if (insideOrganization.getStore()) throw new NestedForOrgError();
  return insideOrganization.run(true, async () => {
    // SET LOCAL lasts until the transaction ends; RESET ROLE below ends it sooner. The platform role is a member of
    // app_runtime that may switch to it without inheriting its rights (sql/bootstrap.sql).
    await tx.$executeRaw`SET LOCAL ROLE app_runtime`;
    const [session] = await tx.$queryRaw<{ role: string }[]>`
      SELECT current_user AS role, set_config('app.org_id', ${organizationId}, true)`;
    if (session?.role !== "app_runtime") throw new WrongPlatformRoleError(session?.role);
    let result: T;
    try {
      result = await fn(hidingUnscopedModels(tx));
    } catch (error) {
      // A caller may catch this and go on in the transaction, so leave the organization. After a database error the
      // transaction is aborted and leaving fails too; the original error is the one worth reporting.
      await leaveOrganization(tx).catch(() => undefined);
      throw error;
    }
    await leaveOrganization(tx);
    return result;
  });
}

async function leaveOrganization(tx: PlatformTx): Promise<void> {
  await tx.$executeRaw`RESET ROLE`;
  const [session] = await tx.$queryRaw<{ role: string }[]>`
    SELECT current_user AS role, set_config('app.org_id', '', true)`;
  if (session?.role !== "app_platform") throw new WrongPlatformRoleError(session?.role);
}
