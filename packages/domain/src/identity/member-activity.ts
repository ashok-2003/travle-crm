// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when anyone last used the
// app. Counts and a time only, never who. The time is kept on each member as their requests arrive, not read from
// sessions: signing out, a reset or a removal deletes those.
import { withDeleted } from "@travel-crm/db";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import type { MemberAccess } from "./member-access.js";

/** How stale a member's stored activity may get before a request writes it again: a day, so most requests write none. */
export const ACTIVITY_STEP_MS = 24 * 60 * 60 * 1000;

export interface MemberActivity {
  organizationId: string;
  /** Active members: the seats taken. */
  seatsUsed: number;
  /**
   * When a member last made a request, removed members included, support's impersonation aside; accurate to a day.
   * Null when nobody has made one.
   */
  lastActiveAt: string | null;
}

/**
 * Notes that the member is using the app, for each request the api lets through. It writes only when the stored time
 * is a day old or more, so a busy member costs one write a day. Support's impersonation is support's activity, not
 * the organization's, and isn't noted.
 */
export async function recordMemberActivity(
  database: IdentityDatabase,
  access: MemberAccess,
  now: Date = new Date(),
): Promise<void> {
  if (access.impersonatedBy !== null) return;
  const stale = new Date(now.getTime() - ACTIVITY_STEP_MS);
  // One statement, outside a transaction. The member table has no row-level security, so the organization is filtered
  // here; soft delete leaves removed members alone.
  await database.client.member.updateMany({
    where: {
      id: access.memberId,
      organizationId: access.organizationId,
      OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: stale } }],
    },
    data: { lastActiveAt: now },
  });
}

/**
 * `recordMemberActivity` with a memory: it skips the statement when this recorder wrote for that member less than a
 * day ago, so a busy member costs one write a day per process, not one statement per request. The memory is bounded
 * (oldest out) and lost on restart, which only means one more write.
 */
export function createActivityRecorder(
  database: IdentityDatabase,
  options: { now?: () => Date; maxEntries?: number } = {},
): (access: MemberAccess) => Promise<void> {
  const now = options.now ?? (() => new Date());
  const maxEntries = options.maxEntries ?? 10_000;
  const wroteAt = new Map<string, number>();
  return async (access) => {
    if (access.impersonatedBy !== null) return;
    const at = now();
    const last = wroteAt.get(access.memberId);
    if (last !== undefined && at.getTime() - last < ACTIVITY_STEP_MS) return;
    await recordMemberActivity(database, access, at);
    wroteAt.delete(access.memberId);
    wroteAt.set(access.memberId, at.getTime());
    if (wroteAt.size > maxEntries) {
      const oldest = wroteAt.keys().next();
      if (!oldest.done) wroteAt.delete(oldest.value);
    }
  };
}

/** Seats used and last activity of each organization asked about, in the order asked. */
export async function memberActivity(tx: IdentityTx, organizationIds: readonly string[]): Promise<MemberActivity[]> {
  if (organizationIds.length === 0) return [];
  const where = { organizationId: { in: [...organizationIds] } };
  // Soft delete leaves removed members out of the seats, but someone removed since still used the app then.
  const seats = await tx.member.groupBy({ by: ["organizationId"], where, _count: { _all: true } });
  const active = await withDeleted(() =>
    tx.member.groupBy({ by: ["organizationId"], where, _max: { lastActiveAt: true } }),
  );
  const seatsOf = new Map(seats.map((row) => [row.organizationId, row._count._all]));
  const lastOf = new Map(active.map((row) => [row.organizationId, row._max.lastActiveAt?.toISOString() ?? null]));
  return organizationIds.map((organizationId) => ({
    organizationId,
    seatsUsed: seatsOf.get(organizationId) ?? 0,
    lastActiveAt: lastOf.get(organizationId) ?? null,
  }));
}
