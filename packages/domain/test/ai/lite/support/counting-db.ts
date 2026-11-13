// A database that counts the queries a test's code sends through it: each model call (findMany, update...) and each raw
// query is one round trip to Postgres, which is what a turn's cost is measured in.
import type { Database, OrgTx } from "@travel-crm/db";

export interface CountingDatabase {
  db: Database;
  /** Queries sent since the last reset. */
  count(): number;
  reset(): void;
}

export function countingDatabase(db: Database): CountingDatabase {
  let calls = 0;
  const counted = (work: (...args: unknown[]) => unknown, self: object) =>
    function (...args: unknown[]) {
      calls += 1;
      return work.apply(self, args);
    };
  const model = (delegate: object) =>
    new Proxy(delegate, {
      get(target, name) {
        const value: unknown = Reflect.get(target, name);
        return typeof value === "function" ? counted(value as (...args: unknown[]) => unknown, target) : value;
      },
    });
  const watched = (tx: OrgTx): OrgTx =>
    new Proxy(tx, {
      get(target, name) {
        const value: unknown = Reflect.get(target, name);
        if (typeof name === "string" && name.startsWith("$") && typeof value === "function") {
          return counted(value as (...args: unknown[]) => unknown, target);
        }
        return value !== null && typeof value === "object" ? model(value) : value;
      },
    });
  return {
    db: {
      ...db,
      forOrg: (orgId, fn, options) => db.forOrg(orgId, (tx) => fn(watched(tx)), options),
      withoutOrg: (fn, options) => db.withoutOrg((tx) => fn(watched(tx)), options),
    },
    count: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}
