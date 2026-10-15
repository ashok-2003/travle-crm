// Two platform transactions made to overlap, for tests of a lock. The first does its work and stays open, uncommitted,
// while the second runs; it commits only once the second has finished or is waiting on an advisory lock. With the
// lock, the second always waits, then sees the first's commit. Without it, the second waits for nothing and commits
// inside the first's window, on every run. Use a database of the test's own, so other files' locks never count.
import type { PlatformClient, PlatformDatabase, PlatformTx } from "@travel-crm/db/platform";

export async function overlapping<First, Second>(
  platformDb: PlatformDatabase,
  watcher: Pick<PlatformClient, "$queryRaw">,
  first: (tx: PlatformTx) => Promise<First>,
  second: (tx: PlatformTx) => Promise<Second>,
): Promise<[PromiseSettledResult<First>, PromiseSettledResult<Second>]> {
  let reached = (): void => undefined;
  const atBarrier = new Promise<void>((resolve) => (reached = resolve));
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  const firstDone = platformDb.transaction(async (tx) => {
    const result = await first(tx);
    reached();
    await released;
    return result;
  });
  // A first transaction that fails before the barrier leaves nothing to overlap: its error ends the test.
  await Promise.race([atBarrier, firstDone]);
  const secondDone = platformDb.transaction(second);
  await settledOrWaitingOnALock(secondDone, watcher);
  release();
  return Promise.allSettled([firstDone, secondDone]);
}

async function settledOrWaitingOnALock(work: Promise<unknown>, watcher: Pick<PlatformClient, "$queryRaw">) {
  const settled = work.then(
    () => true,
    () => true,
  );
  for (let tries = 0; tries < 100; tries++) {
    const [waiting] = await watcher.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
    if ((waiting?.n ?? 0) > 0) return;
    const pause = new Promise<false>((resolve) => setTimeout(resolve, 20, false));
    if (await Promise.race([settled, pause])) return;
  }
  throw new Error("The second transaction neither finished nor waited on a lock");
}
