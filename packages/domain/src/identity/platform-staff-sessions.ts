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

export async function endPlatformStaffSessions(tx: IdentityTx, userId: string): Promise<EndedImpersonation[]> {
  const impersonations = await tx.session.findMany({
    where: { impersonatedBy: userId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, expiresAt: true, user: { select: { member: true } } },
  });
  await tx.session.deleteMany({ where: { OR: [{ userId }, { impersonatedBy: userId }] } });
  // Support impersonates only active members; one removed since has no log of theirs to write to, as at a stop.
  return impersonations.flatMap(({ user: { member }, ...session }) =>
    member?.deletedAt === null
      ? [{ ...session, organizationId: member.organizationId, memberId: member.id, adminUserId: userId }]
      : [],
  );
}
