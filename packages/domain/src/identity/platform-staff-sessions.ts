// Ending a platform staff member's sessions when they are removed or given a new temporary password: their own, and
// every impersonation they started, which the api's per-request check then refuses at once. The impersonations are
// returned, so the console records each stop in its member's organization's log, as Better Auth's stop endpoint does.
import type { IdentityTx } from "@travel-crm/db/identity";

/** An impersonation ended with its admin's sessions. */
export interface EndedImpersonation {
  organizationId: string;
  /** The impersonated member, as the start entry names them. */
  memberId: string;
  userId: string;
  /** The platform admin who was impersonating. */
  adminUserId: string;
  expiresAt: Date;
}

/**
 * One statement deletes the sessions and returns the impersonations among them, so an impersonation that starts
 * meanwhile is either deleted and returned, or left alone (and refused by the per-request check): never deleted
 * unrecorded. Support impersonates only active members; one removed since has no log of theirs to write to.
 */
export async function endPlatformStaffSessions(tx: IdentityTx, userId: string): Promise<EndedImpersonation[]> {
  const ended = await tx.$queryRaw<Omit<EndedImpersonation, "adminUserId">[]>`
    WITH ended AS (
      DELETE FROM "session" WHERE user_id = ${userId}::uuid OR impersonated_by = ${userId}::uuid
      RETURNING user_id, impersonated_by, expires_at, created_at
    )
    SELECT m.organization_id::text AS "organizationId", m.id::text AS "memberId", e.user_id::text AS "userId",
      e.expires_at AS "expiresAt"
    FROM ended e JOIN member m ON m.user_id = e.user_id AND m.deleted_at IS NULL
    WHERE e.impersonated_by = ${userId}::uuid
    ORDER BY e.created_at`;
  return ended.map((impersonation) => ({ ...impersonation, adminUserId: userId }));
}
