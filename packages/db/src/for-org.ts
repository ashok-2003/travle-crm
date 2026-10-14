// Runs work inside one transaction scoped to one organization. Postgres row-level security does the scoping.
import type { Prisma, PrismaClient } from "./generated/prisma/client.js";

/** A transaction bound to one organization: every query sees and writes only that organization's rows. */
export type OrgTx = Prisma.TransactionClient;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

/** Thrown when the connection is not the app_runtime role: other roles see every organization's rows. */
export class WrongDatabaseRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `forOrg() is connected to the database as ${JSON.stringify(role)}, but isolation only holds for app_runtime. ` +
        "DATABASE_URL must connect as the app_runtime role (not app_migrator, app_platform or an admin user).",
    );
    this.name = "WrongDatabaseRoleError";
  }
}

export async function forOrg<T>(client: PrismaClient, orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  return client.$transaction(async (tx) => {
    // One round trip checks who we are and sets the organization. is_local = true: the setting ends with this
    // transaction, so a pooled connection never carries it over.
    const [session] = await tx.$queryRaw<{ role: string }[]>`
      SELECT current_user AS role, set_config('app.org_id', ${orgId}, true)`;
    if (session?.role !== "app_runtime") {
      throw new WrongDatabaseRoleError(session?.role);
    }
    return fn(tx);
  });
}
