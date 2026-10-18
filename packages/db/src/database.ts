// The application's handle on the database: organization data is reachable only through forOrg().
import { createPrismaClient } from "./client.js";
import { forOrg, withoutOrg, type ForOrgOptions, type OrgTx } from "./for-org.js";

export interface Database {
  /**
   * Runs fn in one transaction that can see and change only orgId's rows. The only way to reach organization data.
   * Never call it inside another forOrg() (it throws NestedForOrgError): pass that transaction's tx down instead.
   */
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /**
   * Runs fn in one transaction with no organization: for tables without organization_id, which only their own modules
   * reach through it (@travel-crm/db/webhooks, @travel-crm/db/rate-limits), and for database functions that look
   * across organizations. Organization tables show no rows and refuse writes. Like forOrg(), it can't be nested.
   */
  withoutOrg<T>(fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export interface DatabaseOptions {
  /** Largest number of open connections. Keep it small behind a transaction-mode pooler. */
  maxConnections?: number;
  /**
   * Each transaction's limits when the call names none (Prisma's own: wait 2 s for a connection, run 5 s). A slow host
   * needs longer ones: a tenth of a CPU takes longer than 2 s to open its first connection.
   */
  transactionLimits?: ForOrgOptions | undefined;
}

/** Connects as the app_runtime role, the role every api request and job uses. */
export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  const client = createPrismaClient(url, {
    max: options.maxConnections ?? 10,
    transactionLimits: options.transactionLimits,
  });
  return {
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    withoutOrg: (fn, options) => withoutOrg(client, fn, options),
    disconnect: () => client.$disconnect(),
  };
}
