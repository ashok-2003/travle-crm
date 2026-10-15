// Entry point for the platform module only (dependency-cruiser enforces it, tests aside): transactions as the
// app_platform role, which sees every organization (platform_access policy), and, inside one, a step into a single
// organization as app_runtime, where row-level security and the runtime role's grants apply as in db.forOrg().
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import {
  NestedForOrgError,
  OrganizationStepOpenError,
  PlatformTransactionAbortedError,
  WrongPlatformRoleError,
} from "./errors.js";
import {
  allowUnscopedModels,
  assertOrganizationId,
  enterTransaction,
  hidingUnscopedModels,
  type ForOrgOptions,
  type IdentityTx,
  type TransactionClient,
} from "./for-org.js";

export { OrganizationStepOpenError, PlatformTransactionAbortedError, WrongPlatformRoleError } from "./errors.js";
export { deleteOrganizationRows, organizationRows } from "./organization-rows.js";
export type { ForOrgOptions, IdentityTx, OrgTx } from "./for-org.js";

export type PlatformClient = DatabaseClient;

/**
 * A transaction as app_platform: every model, the sign-in tables and the tables without organization_id included, and
 * every organization's rows. Nothing scopes it, so every query names the organization it means.
 */
export type PlatformTx = TransactionClient;

export interface PlatformDatabase {
  /**
   * Runs fn in one transaction as app_platform. Like forOrg(), it can't be nested in another transaction. It commits
   * only as the platform role with no step open, and never after a database error: Postgres would answer that
   * commit with a silent rollback, so it throws instead.
   */
  transaction<T>(fn: (tx: PlatformTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** A plain client as the app_platform role, for tests that set up data. Never use it for requests. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}

/** One open platform transaction, as this file tracks it. */
interface OpenTransaction {
  /** Prisma's transaction. Only this file uses it directly; fn gets a guarded handle (guardedHandle). */
  readonly tx: TransactionClient;
  /** True while asOrganization() runs in it: its one connection then belongs to the step. */
  inStep: boolean;
  /** Set once Postgres aborted it during a step, to the error that did it. */
  abortedBy: { error: unknown } | null;
}

/** The open platform transactions, by the handle each gave its function. */
const openTransactions = new WeakMap<object, OpenTransaction>();

/** Connects as the app_platform role. Only the platform console holds this URL; the api and worker never do. */
export function createPlatformDatabase(url: string, options: DatabaseOptions = {}): PlatformDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 5 });
  return {
    transaction: (fn, transactionOptions = {}) =>
      enterTransaction(() =>
        client.$transaction(async (tx) => {
          // No organization set, a guarantee rather than an assumption about the pooled connection.
          await setOrganization(tx, "", "app_platform");
          const open: OpenTransaction = { tx, inStep: false, abortedBy: null };
          const handle = guardedHandle(open);
          openTransactions.set(handle, open);
          // The platform role reads and writes webhook events itself (tombstones after a purge).
          allowUnscopedModels(handle, handle);
          const result = await fn(handle);
          // Before the commit: not with a step still open or after one failed, and not after any other database error
          // its caller caught, where this round trip fails ("current transaction is aborted").
          assertUsable(open);
          await setOrganization(tx, "", "app_platform");
          return result;
        }, transactionOptions),
      ),
    disconnect: () => client.$disconnect(),
  };
}

/**
 * Inside a platform transaction, runs fn as app_runtime in one organization: row-level security limits every query to
 * it, new rows take its id by default, and only the runtime role's grants apply, as in db.forOrg(). So module code
 * written for forOrg() runs unchanged, in the same transaction as the platform's own writes. One difference: the
 * session is still app_platform's, so SQL that reset the role would leave the organization. Only this package writes
 * such SQL; ESLint refuses it everywhere else. Afterwards the transaction is the platform role again, with no
 * organization set, even when fn failed. One step at a time: not nested, and nothing beside it (no Promise.all).
 */
export async function asOrganization<T>(
  tx: PlatformTx,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  assertOrganizationId(organizationId);
  const open = openTransactions.get(tx);
  // Never a forOrg() transaction, which it would switch into another organization.
  if (!open) throw new TypeError("asOrganization() takes only the transaction a platform transaction gave fn");
  // Checked and set before any SQL, so a second step, inside this one or beside it, never starts: their role switches
  // would interleave on the one connection, and one step's queries would run in the other's organization.
  if (open.inStep) throw new NestedForOrgError("step");
  assertUsable(open);
  open.inStep = true;
  try {
    return await inOrganization(open, organizationId, fn);
  } finally {
    open.inStep = false;
  }
}

async function inOrganization<T>(
  open: OpenTransaction,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  // SET LOCAL lasts until the transaction ends; RESET ROLE below ends it sooner. The platform role is a member of
  // app_runtime that may switch to it without inheriting its rights (sql/bootstrap.sql).
  await switchRole(open, async () => {
    await open.tx.$executeRaw`SET LOCAL ROLE app_runtime`;
    await setOrganization(open.tx, organizationId, "app_runtime");
  });
  let result: T;
  try {
    result = await fn(hidingUnscopedModels(open.tx));
  } catch (error) {
    // A caller may catch this and go on in the transaction, so leave the organization. After a database error
    // Postgres has aborted the transaction and leaving fails too; the step's error is the one that aborted it.
    await leaveOrganization(open).catch(() => {
      open.abortedBy = { error };
    });
    throw error;
  }
  await leaveOrganization(open);
  return result;
}

/** Back to the platform role, with no organization set. */
function leaveOrganization(open: OpenTransaction): Promise<void> {
  return switchRole(open, async () => {
    await open.tx.$executeRaw`RESET ROLE`;
    await setOrganization(open.tx, "", "app_platform");
  });
}

/**
 * Runs a switch of role. If it fails, the transaction is aborted or in no known role, so it is marked aborted: nothing
 * more may run in it, and it must not commit.
 */
async function switchRole(open: OpenTransaction, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    open.abortedBy = { error };
    throw error;
  }
}

/** Sets app.org_id until the transaction ends and checks, in the same round trip, that it runs as `role`. */
async function setOrganization(tx: TransactionClient, organizationId: string, role: string): Promise<void> {
  const [session] = await tx.$queryRaw<{ role: string }[]>`
    SELECT current_user AS role, set_config('app.org_id', ${organizationId}, true)`;
  if (session?.role !== role) throw new WrongPlatformRoleError(session?.role);
}

/**
 * The handle a platform transaction's fn gets: the transaction itself, refusing every use while a step is open (its
 * connection then runs in the organization) and once a failed step left it aborted.
 */
function guardedHandle(open: OpenTransaction): PlatformTx {
  return new Proxy(open.tx, {
    get(target, property) {
      assertUsable(open);
      return Reflect.get(target, property) as unknown;
    },
  });
}

/** Throws, before any SQL runs, unless the transaction can go on as the platform role. */
function assertUsable(open: OpenTransaction): void {
  if (open.abortedBy) throw new PlatformTransactionAbortedError({ cause: open.abortedBy.error });
  if (open.inStep) throw new OrganizationStepOpenError();
}
