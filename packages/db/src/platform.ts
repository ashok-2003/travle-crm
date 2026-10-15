// Entry point for the platform module only (dependency-cruiser enforces it, tests aside): transactions as the
// app_platform role, which sees every organization (platform_access policy), and, inside one, a step into a single
// organization as app_runtime, where row-level security and the runtime role's grants apply as in db.forOrg().
// Over 200 lines: the transaction and its step guard each other's state, so they stay together.
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import {
  NestedForOrgError,
  OrganizationStepEndedError,
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
import { guardedQueries } from "./guarded-queries.js";

export {
  OrganizationStepEndedError,
  OrganizationStepOpenError,
  PlatformTransactionAbortedError,
  WrongPlatformRoleError,
} from "./errors.js";
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
  /** Prisma's transaction. Only this file uses it directly; fn gets a guarded handle to it. */
  readonly tx: TransactionClient;
  /** The step into an organization running in it, if any: its one connection then belongs to the step. */
  step: OpenStep | null;
  /** Set once Postgres aborted it during a step, to the error that did it. */
  abortedBy: { error: unknown } | null;
  /** The platform handle's queries running now. A step waits for them before it switches role. */
  readonly running: Set<Promise<unknown>>;
}

/** One step into an organization. */
interface OpenStep {
  /** False once the step's work has settled: from then on its handle refuses every query. */
  open: boolean;
  /** The step handle's queries running now. The step waits for them before it switches back. */
  readonly running: Set<Promise<unknown>>;
  /** What asOrganization() returned, so the transaction can handle it if fn leaves the step behind. */
  promise: Promise<unknown> | null;
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
          const open: OpenTransaction = { tx, step: null, abortedBy: null, running: new Set() };
          // Refused while a step is open (the connection then runs in the organization) or once one left it aborted.
          const handle = guardedQueries(tx, {
            check: () => {
              assertUsable(open);
            },
            running: open.running,
          });
          openTransactions.set(handle, open);
          // The platform role reads and writes webhook events itself (tombstones after a purge).
          allowUnscopedModels(handle, handle);
          try {
            const result = await fn(handle);
            await Promise.allSettled(open.running);
            // Before the commit: not with a step still open or after one failed, and not after any other database
            // error its caller caught, where this round trip fails ("current transaction is aborted").
            assertUsable(open);
            await setOrganization(tx, "", "app_platform");
            return result;
          } finally {
            // A step fn left behind, as when a refused query beside it threw first, fails once the transaction rolls
            // back. Its rejection is handled here, as the transaction's own error reports the problem: left
            // unhandled, it would end the process.
            open.step?.promise?.catch(() => undefined);
          }
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
 * fn's transaction works only until fn settles: await everything it starts.
 */
export function asOrganization<T>(
  tx: PlatformTx,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  const promise = runStep(tx, organizationId, fn);
  // runStep's checks run before its first await, so a step without a promise yet is the one it has just begun.
  const step = openTransactions.get(tx)?.step;
  if (step && !step.promise) step.promise = promise;
  return promise;
}

async function runStep<T>(tx: PlatformTx, organizationId: string, fn: (orgTx: IdentityTx) => Promise<T>): Promise<T> {
  assertOrganizationId(organizationId);
  const open = openTransactions.get(tx);
  // Never a forOrg() transaction, which it would switch into another organization.
  if (!open) throw new TypeError("asOrganization() takes only the transaction a platform transaction gave fn");
  // Checked and set before any SQL, so a second step, inside this one or beside it, never starts: their role switches
  // would interleave on the one connection, and one step's queries would run in the other's organization.
  if (open.step) throw new NestedForOrgError("step");
  assertUsable(open);
  const step: OpenStep = { open: true, running: new Set(), promise: null };
  open.step = step;
  try {
    // Platform queries that started before the step finish first, as the platform role.
    await Promise.allSettled(open.running);
    return await inOrganization(open, step, organizationId, fn);
  } finally {
    step.open = false;
    open.step = null;
  }
}

async function inOrganization<T>(
  open: OpenTransaction,
  step: OpenStep,
  organizationId: string,
  fn: (orgTx: IdentityTx) => Promise<T>,
): Promise<T> {
  // SET LOCAL lasts until the transaction ends; RESET ROLE below ends it sooner. The platform role is a member of
  // app_runtime that may switch to it without inheriting its rights (sql/bootstrap.sql).
  await switchRole(open, async () => {
    await open.tx.$executeRaw`SET LOCAL ROLE app_runtime`;
    await setOrganization(open.tx, organizationId, "app_runtime");
  });
  const stepGuard = {
    check: () => {
      if (!step.open) throw new OrganizationStepEndedError();
    },
    running: step.running,
  };
  let result: T;
  try {
    result = await fn(guardedQueries(hidingUnscopedModels(open.tx), stepGuard));
  } catch (error) {
    await endStep(step);
    // A caller may catch this and go on in the transaction, so leave the organization. After a database error
    // Postgres has aborted the transaction and leaving fails too; the step's error is the one that aborted it.
    await leaveOrganization(open).catch(() => {
      open.abortedBy = { error };
    });
    throw error;
  }
  await endStep(step);
  await leaveOrganization(open);
  return result;
}

/** Refuses the step's handle from now on, then waits for the queries it started, so all of them run in the step. */
async function endStep(step: OpenStep): Promise<void> {
  step.open = false;
  await Promise.allSettled(step.running);
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

/** Throws, before any SQL runs, unless the transaction can go on as the platform role. */
function assertUsable(open: OpenTransaction): void {
  if (open.abortedBy) throw new PlatformTransactionAbortedError({ cause: open.abortedBy.error });
  if (open.step) throw new OrganizationStepOpenError();
}
