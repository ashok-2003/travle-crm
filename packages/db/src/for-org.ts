// Runs work inside one transaction scoped to one organization. Postgres row-level security does the scoping.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { DatabaseClient } from "./client.js";
import { NestedForOrgError, WrongDatabaseRoleError } from "./errors.js";

export { NestedForOrgError, WrongDatabaseRoleError } from "./errors.js";

/**
 * Better Auth's tables. They have no row-level security, because sign-in reads them before the organization is known,
 * so OrgTx hides them. Only the identity module reaches them, through @travel-crm/db/identity.
 */
type SignInModel =
  "user" | "session" | "account" | "verification" | "twoFactor" | "organization" | "member" | "invitation";

/** Prisma's methods that take SQL as a plain string. The tagged-template $queryRaw and $executeRaw remain. */
type RawStringMethod = "$executeRawUnsafe" | "$queryRawUnsafe";

/** A transaction bound to one organization that can also reach the sign-in tables. Only the identity module gets one. */
export type IdentityTx = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;

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

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

/**
 * Runs fn in one transaction with no organization set, for the few tables without organization_id (webhook events,
 * rate-limit counters) and the database functions that look across organizations without revealing their rows.
 * Every organization table shows no rows and refuses writes, exactly as row-level security fails closed.
 */
export async function withoutOrg<T>(
  client: DatabaseClient,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, async () =>
    client.$transaction(async (tx) => {
      const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
      if (session?.role !== "app_runtime") {
        throw new WrongDatabaseRoleError(session?.role);
      }
      return fn(tx);
    }, options),
  );
}

/** Runs fn in one transaction that sees and changes only orgId's rows. Never call it inside another forOrg(). */
export async function forOrg<T>(
  client: DatabaseClient,
  orgId: string,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, async () =>
    client.$transaction(async (tx) => {
      // One round trip checks who we are and sets the organization. is_local = true: the setting ends with this
      // transaction, so a pooled connection never carries it over.
      const [session] = await tx.$queryRaw<{ role: string }[]>`
        SELECT current_user AS role, set_config('app.org_id', ${orgId}, true)`;
      if (session?.role !== "app_runtime") {
        throw new WrongDatabaseRoleError(session?.role);
      }
      return fn(tx);
    }, options),
  );
}
