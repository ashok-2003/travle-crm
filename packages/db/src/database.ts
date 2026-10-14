// The application's handle on the database: organization data is reachable only through forOrg().
import { createPrismaClient } from "./client.js";
import { forOrg, type ForOrgOptions, type OrgTx } from "./for-org.js";

export interface Database {
  /**
   * Runs fn in one transaction that can see and change only orgId's rows. The only way to reach organization data.
   * Never call it inside another forOrg() (it throws NestedForOrgError): pass that transaction's tx down instead.
   */
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export interface DatabaseOptions {
  /** Largest number of open connections. Keep it small behind a transaction-mode pooler. */
  maxConnections?: number;
}

/** Connects as the app_runtime role, the role every api request and job uses. */
export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 10 });
  return {
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    disconnect: () => client.$disconnect(),
  };
}
