// Runs work inside one transaction scoped to one organization (forOrg), or to none (withoutOrg). Postgres row-level
// security does the scoping.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { DatabaseClient } from "./client.js";
import { NestedForOrgError, UnscopedModelError, WrongDatabaseRoleError } from "./errors.js";

export { NestedForOrgError, WrongDatabaseRoleError } from "./errors.js";

/**
 * Better Auth's tables. They have no row-level security, because sign-in reads them before the organization is known,
 * so OrgTx hides them. Only the identity module reaches them, through @travel-crm/db/identity.
 */
type SignInModel =
  "user" | "session" | "account" | "verification" | "twoFactor" | "organization" | "member" | "invitation";

/** Prisma's methods that take SQL as a plain string. The tagged-template $queryRaw and $executeRaw remain. */
type RawStringMethod = "$executeRawUnsafe" | "$queryRawUnsafe";

/**
 * The tables without row-level security: webhook events and rate-limit counters (no organization_id), and the Sheets
 * sync's check schedule and spreadsheet claim (an organization_id, but ids, times and a keyed hash only). Every
 * transaction hides them, and so the sheets hash key's check row (no organization_id); only their own modules reach
 * them, in db.withoutOrg(), through @travel-crm/db/webhooks, @travel-crm/db/rate-limits, @travel-crm/db/sheet-schedule
 * and @travel-crm/db/sheets-key-check. The same holds for the Meta lead ads' Page route (an organization_id, but ids
 * and times only), through @travel-crm/db/meta-routes.
 */
export type UnscopedModel =
  | "webhookEvent"
  | "rateLimitCounter"
  | "sheetCheckSchedule"
  | "sheetSpreadsheetClaim"
  | "sheetsKeyCheck"
  | "metaPageRoute";
const unscopedModels: readonly string[] = [
  "webhookEvent",
  "rateLimitCounter",
  "sheetCheckSchedule",
  "sheetSpreadsheetClaim",
  "sheetsKeyCheck",
  "metaPageRoute",
] satisfies UnscopedModel[];

/** A transaction with every model, which this package's entry points unwrap. */
export type TransactionClient = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;

/** A transaction bound to one organization that can also reach the sign-in tables. Only the identity module gets one. */
export type IdentityTx = Omit<TransactionClient, UnscopedModel>;

/** A transaction bound to one organization: every query sees and writes only that organization's rows. */
export type OrgTx = Omit<IdentityTx, SignInModel>;

/** Limits for one forOrg() transaction, passed to Prisma. Prisma's defaults: wait 2 s for a connection, run 5 s. */
export interface ForOrgOptions {
  /** Longest wait for a free connection, in milliseconds. */
  maxWait?: number;
  /** Longest the transaction may run, in milliseconds. Past it, the work is rolled back and forOrg() rejects. */
  timeout?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Set while a forOrg() transaction runs, to catch a forOrg() inside it. */
const insideForOrg = new AsyncLocalStorage<true>();

/** The handles withoutOrg() gave out, each with the transaction behind it, which still has the unscoped models. */
const withoutOrgTransactions = new WeakMap<object, TransactionClient>();

/**
 * A transaction or client as other code gets it: the types already leave the unscoped models out, and this refuses
 * them at run time too, so a cast can't reach a table without row-level security.
 */
export function hidingUnscopedModels<Target extends object>(target: Target): Omit<Target, UnscopedModel> {
  return new Proxy(target, {
    get(target, property) {
      if (typeof property === "string" && unscopedModels.includes(property)) throw new UnscopedModelError(property);
      return Reflect.get(target, property) as unknown;
    },
  });
}

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

/** Lets a transaction handle reach the tables without organization_id through their entry points. */
export function allowUnscopedModels(handle: object, tx: TransactionClient): void {
  withoutOrgTransactions.set(handle, tx);
}

/**
 * Runs fn as one of this package's transactions (forOrg, withoutOrg, a platform transaction), refusing to start
 * inside another one: the inner transaction would run on a second connection, blind to the outer one's writes.
 */
export async function enterTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, fn);
}

/** Throws InvalidOrganizationIdError, before any SQL runs, unless orgId is a UUID. */
export function assertOrganizationId(orgId: string): void {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
}

/**
 * The shared shell of forOrg() and withoutOrg(): refuses nesting, opens the transaction, sets app.org_id (to "" for no
 * organization, so that is a guarantee rather than an assumption about the pooled connection) and checks the role in
 * the same round trip.
 */
async function inOrgTransaction<T>(
  client: DatabaseClient,
  orgId: string,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions,
): Promise<T> {
  return enterTransaction(async () =>
    client.$transaction(async (tx) => {
      // One round trip checks who we are and sets the organization. is_local = true: the setting ends with this
      // transaction, so a pooled connection never carries it over.
      const [session] = await tx.$queryRaw<{ role: string }[]>`
        SELECT current_user AS role, set_config('app.org_id', ${orgId}, true)`;
      if (session?.role !== "app_runtime") {
        throw new WrongDatabaseRoleError(session?.role);
      }
      const handle: IdentityTx = hidingUnscopedModels(tx);
      // No organization: the unscoped tables' entry points may reach through this handle.
      if (orgId === "") allowUnscopedModels(handle, tx);
      return fn(handle);
    }, options),
  );
}

/**
 * Runs fn in one transaction with no organization set, for the database functions that look across organizations
 * without revealing their rows, and for the tables without organization_id, which only their entry points
 * (@travel-crm/db/webhooks, @travel-crm/db/rate-limits) reach through its transaction. Every organization table
 * shows no rows and refuses writes, exactly as row-level security fails closed.
 */
export async function withoutOrg<T>(
  client: DatabaseClient,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  return inOrgTransaction(client, "", fn, options);
}

/** Runs fn in one transaction that sees and changes only orgId's rows. Never call it inside another forOrg(). */
export async function forOrg<T>(
  client: DatabaseClient,
  orgId: string,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  assertOrganizationId(orgId);
  return inOrgTransaction(client, orgId, fn, options);
}

/**
 * A table without organization_id, from a handle db.withoutOrg() or a platform transaction gave out. For
 * @travel-crm/db's entry points; any other transaction, forOrg()'s included, throws UnscopedModelError.
 */
export function unscopedModel<Model extends UnscopedModel>(tx: OrgTx, model: Model): TransactionClient[Model] {
  const transaction = withoutOrgTransactions.get(tx);
  if (transaction === undefined) throw new UnscopedModelError(model);
  return transaction[model];
}
