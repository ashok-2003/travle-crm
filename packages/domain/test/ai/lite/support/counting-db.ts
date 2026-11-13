// A database that counts the queries a test's code sends through it: each model call (findMany, update...) and each raw
// query is one round trip to Postgres, which is what a turn's cost is measured in.
import type { Database, OrgTx } from "@travel-crm/db";

export interface CountingDatabase {
  db: Database;
  /** Queries sent since the last reset. */
  count(): number;
  /** The queries of each transaction since the last reset, in the order they were opened. */
  transactions(): number[];
  reset(): void;
}

export function countingDatabase(db: Database): CountingDatabase {
  let calls = 0;
  let transactions: number[] = [];
  const counted = (work: (...args: unknown[]) => unknown, self: object, transaction: number) =>
    function (...args: unknown[]) {
      calls += 1;
      transactions[transaction] = (transactions[transaction] ?? 0) + 1;
      return work.apply(self, args);
    };
  const model = (delegate: object, transaction: number) =>
    new Proxy(delegate, {
      get(target, name) {
        const value: unknown = Reflect.get(target, name);
        return typeof value === "function"
          ? counted(value as (...args: unknown[]) => unknown, target, transaction)
          : value;
      },
    });
  const watched = (tx: OrgTx): OrgTx => {
    const transaction = transactions.push(0) - 1;
    return new Proxy(tx, {
      get(target, name) {
        const value: unknown = Reflect.get(target, name);
        if (typeof name === "string" && name.startsWith("$") && typeof value === "function") {
          return counted(value as (...args: unknown[]) => unknown, target, transaction);
        }
        return value !== null && typeof value === "object" ? model(value, transaction) : value;
      },
    });
  };
  return {
    db: {
      ...db,
      forOrg: (orgId, fn, options) => db.forOrg(orgId, (tx) => fn(watched(tx)), options),
      withoutOrg: (fn, options) => db.withoutOrg((tx) => fn(watched(tx)), options),
    },
    count: () => calls,
    transactions: () => [...transactions],
    reset: () => {
      calls = 0;
      transactions = [];
    },
  };
}
