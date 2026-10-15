// A platform transaction that lets something happen on another connection right after its first statement on the
// session table, before its next one: for proving that what code reads of the sessions and what it deletes are one
// and the same, whatever commits in between.
import type { PlatformTx } from "@travel-crm/db/platform";

type Run = (...args: unknown[]) => PromiseLike<unknown>;

export function afterFirstSessionStatement(tx: PlatformTx, meanwhile: () => Promise<unknown>): PlatformTx {
  let done = false;
  const thenMeanwhile = async (query: PromiseLike<unknown>): Promise<unknown> => {
    const result = await query;
    if (!done) {
      done = true;
      await meanwhile();
    }
    return result;
  };
  const touchesSessions = (statement: unknown): boolean =>
    Array.isArray(statement) && statement.join("").includes("session");
  return new Proxy(tx, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property === "session") {
        // The session model: each of its queries.
        return new Proxy(value as object, {
          get: (delegate, method) => {
            const run = Reflect.get(delegate, method) as Run;
            return (...args: unknown[]) => thenMeanwhile(run.apply(delegate, args));
          },
        });
      }
      if (property === "$queryRaw" || property === "$executeRaw") {
        const run = value as Run;
        return (...args: unknown[]) => {
          const query = run.apply(target, args);
          return touchesSessions(args[0]) ? thenMeanwhile(query) : query;
        };
      }
      return typeof value === "function" ? (value as Run).bind(target) : value;
    },
  });
}
