// Who is acting, for request checks 1 and 4 (spec 6.5). Read from the database on every request, so a role change
// or a removal takes effect on the next request rather than when the 5-minute session cookie expires.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { withDeleted } from "@travel-crm/db";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { pendingStep, type MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { shownEmail } from "./sign-in-names.js";

/** The user's active membership, role and permissions in an organization, or null when they have none there. */
export async function resolveAccess(
  database: IdentityDatabase,
  userId: string,
  organizationId: string,
): Promise<MemberAccess | null> {
  return database.forOrg(organizationId, async (tx) => {
    const member = await tx.member.findUnique({
      where: { userId },
      include: {
        user: { select: { mustChangePassword: true, twoFactorEnabled: true } },
        organization: { select: { requireTwoFactor: true } },
      },
    });
    // The member table has no row-level security, so the organization is checked here.
    if (member?.organizationId !== organizationId) return null;
    const role = await tx.role.findUnique({
      where: { organizationId_key: { organizationId, key: member.role } },
      include: { permissions: true },
    });
    return {
      userId,
      memberId: member.id,
      organizationId,
      role: { key: member.role, name: role?.name ?? member.role, isOwner: role?.isOwner ?? false },
      // A role that no longer exists grants nothing (deleting a role is refused while it has members).
      permissions: role?.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role?.permissions ?? []),
      mustChangePassword: member.user.mustChangePassword,
      twoFactorEnabled: member.user.twoFactorEnabled ?? false,
      organizationRequiresTwoFactor: member.organization.requireTwoFactor,
    };
  });
}

/** The signed-in session, as far as me.get needs it. */
export interface SignedInSession {
  userId: string;
  organizationId: string | null;
  impersonatedBy: string | null;
}

/** Everything the web app needs about the signed-in person, or null if their user no longer exists. */
export async function describeSignedInPerson(
  database: IdentityDatabase,
  session: SignedInSession,
): Promise<MeOutput | null> {
  const user = await database.client.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const access = session.organizationId ? await resolveAccess(database, user.id, session.organizationId) : null;
  const organization = access
    ? await database.client.organization.findUnique({ where: { id: access.organizationId } })
    : null;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: shownEmail(user.email),
      username: user.displayUsername,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
    },
    impersonatedBy: session.impersonatedBy,
    isPlatformAdmin: await isPlatformAdmin(database, user),
    organization: organization && {
      id: organization.id,
      name: organization.name,
      code: organization.code,
      requireTwoFactor: organization.requireTwoFactor,
    },
    member: access && {
      memberId: access.memberId,
      role: access.role,
      permissions: access.permissions.toGrants(),
    },
    pendingStep: access && pendingStep(access),
  };
}

/** Platform staff (spec 6.1): Better Auth role "admin" and no membership in any organization, ever. */
export async function isPlatformAdmin(
  database: IdentityDatabase,
  user: { id: string; role?: string | null | undefined },
): Promise<boolean> {
  if (user.role !== "admin") return false;
  const membership = await withDeleted(() => database.client.member.findUnique({ where: { userId: user.id } }));
  return membership === null;
}
