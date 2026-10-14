// The application's handle on the database: organization data is reachable only through forOrg().
import { createPrismaClient } from "./client.js";
import { forOrg, type OrgTx } from "./for-org.js";

export interface Database {
  /** Runs fn in one transaction that can see and change only orgId's rows. The only way to reach organization data. */
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T>;
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
    forOrg: (orgId, fn) => forOrg(client, orgId, fn),
    disconnect: () => client.$disconnect(),
  };
}
