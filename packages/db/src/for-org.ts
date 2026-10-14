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

export async function forOrg<T>(client: PrismaClient, orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  return client.$transaction(async (tx) => {
    // is_local = true: the setting ends with this transaction, so a pooled connection never carries it over.
    await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
