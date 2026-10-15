// A transaction handle whose queries are checked twice: when code makes one, and again when it runs. Prisma's queries
// are lazy, starting only when something awaits them, maybe after the transaction has switched role. Each query that
// is running is counted, so a role switch can wait for the queries started before it.

/** When a handle's queries may run, and the ones running now. */
export interface QueryGuard {
  /** Throws when a query may not be made or run now. */
  check(): void;
  /** The handle's queries that have started and not yet settled. */
  readonly running: Set<Promise<unknown>>;
}

/**
 * Wraps a transaction, or one of its model delegates, so every property read and method call runs guard.check(), and
 * every query a method returns runs it again when it starts. Methods run on the wrapped object itself, so Prisma's
 * own internals never meet the guard.
 */
export function guardedQueries<Target extends object>(target: Target, guard: QueryGuard): Target {
  return new Proxy(target, {
    get(target, property) {
      guard.check();
      const value: unknown = Reflect.get(target, property);
      if (typeof value === "function") return guardedMethod(value as (...args: unknown[]) => unknown, target, guard);
      // A model delegate, such as tx.orgCounter.
      if (typeof value === "object" && value !== null) return guardedQueries(value, guard);
      return value;
    },
  });
}

function guardedMethod(method: (...args: unknown[]) => unknown, self: object, guard: QueryGuard) {
  return (...args: unknown[]): unknown => {
    guard.check();
    const result = Reflect.apply(method, self, args);
    return isThenable(result) ? checkedWhenRun(result, guard) : result;
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** A lazy query that checks the guard again when it starts, and starts once however often it is awaited. */
function checkedWhenRun(
  query: PromiseLike<unknown>,
  guard: QueryGuard,
): Pick<Promise<unknown>, "then" | "catch" | "finally"> {
  let run: Promise<unknown> | undefined;
  const started = (): Promise<unknown> => (run ??= runChecked(query, guard));
  return {
    then: (onFulfilled, onRejected) => started().then(onFulfilled, onRejected),
    catch: (onRejected) => started().catch(onRejected),
    finally: (onFinally) => started().finally(onFinally),
  };
}

async function runChecked(query: PromiseLike<unknown>, guard: QueryGuard): Promise<unknown> {
  guard.check();
  const running = Promise.resolve(query);
  guard.running.add(running);
  try {
    return await running;
  } finally {
    guard.running.delete(running);
  }
}
