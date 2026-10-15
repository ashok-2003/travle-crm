// Waiting until a change is stuck behind a lock, for the tests of concurrent changes. Test files share one Postgres and
// run in parallel, so a wait is tied to the transaction holding the lock: another file's lock waits never count.
import type { OrgTx } from "@travel-crm/db";

/** Any client or transaction of ours: they all run tagged-template SQL the same way. */
type Queryable = Pick<OrgTx, "$queryRaw">;

/** The backend process id of the connection running tx: the holder that waitUntilBlockedBy waits on. */
export async function backendPid(tx: Queryable): Promise<number> {
  const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  if (row === undefined) throw new Error("pg_backend_pid() returned no row");
  return row.pid;
}

export interface BlockedOptions {
  /** How many sessions must be waiting. Default 1. */
  count?: number;
  /** Only sessions whose current statement contains this text count, e.g. 'UPDATE "public"."member" SET'. */
  statement?: string;
}

/**
 * Waits until `count` sessions are blocked by the holder's backend, directly or queued behind one that is. Run it on
 * another connection than the holder's: `client` only reads pg_stat_activity.
 */
export async function waitUntilBlockedBy(
  client: Queryable,
  holderPid: number,
  { count = 1, statement }: BlockedOptions = {},
): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    const [waiting] = await client.$queryRaw<{ n: number }[]>`
      WITH RECURSIVE waiting(pid) AS (
        SELECT pid FROM pg_stat_activity WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))
        UNION
        SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
      )
      SELECT count(*)::int AS n FROM waiting JOIN pg_stat_activity a USING (pid)
      WHERE ${statement ?? null}::text IS NULL OR strpos(a.query, ${statement ?? null}::text) > 0`;
    if ((waiting?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const at = statement === undefined ? "" : ` at ${JSON.stringify(statement)}`;
  throw new Error(`Fewer than ${String(count)} sessions waited for backend ${String(holderPid)}${at}`);
}
