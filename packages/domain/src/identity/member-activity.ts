// What the platform dashboard shows of an organization's people (spec 7.4): seats used, and when anyone last used the
// app. Counts and a time only, never who.
import type { IdentityTx } from "@travel-crm/db/identity";

export interface MemberActivity {
  organizationId: string;
  /** Active members: the seats taken. */
  seatsUsed: number;
  /** When a member's session was last used, support's impersonation aside; null when nobody has signed in. */
  lastActiveAt: string | null;
}

/** Seats used and last activity of each organization asked about, in the order asked. */
export async function memberActivity(tx: IdentityTx, organizationIds: readonly string[]): Promise<MemberActivity[]> {
  if (organizationIds.length === 0) return [];
  // Soft delete leaves removed members out of the counts.
  const seats = await tx.member.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: [...organizationIds] } },
    _count: { _all: true },
  });
  const sessions = await tx.$queryRaw<{ organization_id: string; last_active: Date }[]>`
    SELECT m.organization_id, max(s.updated_at) AS last_active
    FROM session s JOIN member m ON m.user_id = s.user_id
    WHERE m.organization_id = ANY (${[...organizationIds]}::uuid[]) AND s.impersonated_by IS NULL
    GROUP BY m.organization_id`;
  const seatsOf = new Map(seats.map((row) => [row.organizationId, row._count._all]));
  const lastOf = new Map(sessions.map((row) => [row.organization_id, row.last_active.toISOString()]));
  return organizationIds.map((organizationId) => ({
    organizationId,
    seatsUsed: seatsOf.get(organizationId) ?? 0,
    lastActiveAt: lastOf.get(organizationId) ?? null,
  }));
}
