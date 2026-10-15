// Who is acting, for request checks 1 and 4 (spec 6.5). Read from the database on every request, so a role change
// or a removal takes effect on the next request rather than when the 5-minute session cookie expires.
import type { MeOutput } from "@travel-crm/contracts/identity";
import type { PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { withDeleted } from "@travel-crm/db";
import type { IdentityClient, IdentityDatabase } from "@travel-crm/db/identity";
import { isBannedNow } from "./bans.js";
import { pendingStep, type MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { shownEmail } from "./sign-in-names.js";

/** What the session says about who is really acting. */
export interface AccessSession {
  /** The platform admin's user id while support impersonates the user, else null. */
  impersonatedBy: string | null;
}

/**
 * The user's active membership, role and permissions in an organization, or null when they have none there. The
 * session marks support's impersonation, so the audit log can record who was really acting.
 */
export async function resolveAccess(
  database: IdentityDatabase,
  userId: string,
  organizationId: string,
  session: AccessSession = { impersonatedBy: null },
): Promise<MemberAccess | null> {
  return database.forOrg(organizationId, async (tx) => {
    const member = await tx.member.findUnique({
      where: { userId },
      include: {
        user: { select: { mustChangePassword: true, twoFactorEnabled: true, banned: true, banExpires: true } },
        organization: { select: { requireTwoFactor: true } },
      },
    });
    // The member table has no row-level security, so the organization is checked here.
    if (member?.organizationId !== organizationId) return null;
    // Better Auth's admin ban: refused at sign-in, but a session opened earlier must stop working too.
    if (isBannedNow(member.user)) return null;
    const role = await tx.role.findUnique({
      where: { organizationId_key: { organizationId, key: member.role } },
      include: { permissions: true },
    });
    return {
      userId,
      memberId: member.id,
      organizationId,
      source: session.impersonatedBy ? "impersonation" : "web",
      impersonatedBy: session.impersonatedBy,
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

/**
 * Better Auth's user.role for each level of platform staff (spec 5, 6.1). Support works with organizations:
 * onboarding, subscriptions, impersonation, failed jobs. A super admin also manages plans, platform staff and
 * permanent deletion. "admin" came first (plan 2) and means support.
 */
export const platformStaffRoles: Readonly<Record<PlatformStaffLevel, string>> = {
  support: "admin",
  "super-admin": "super-admin",
};

/** Platform staff as the console sees them. */
export interface PlatformStaffMember {
  userId: string;
  name: string;
  level: PlatformStaffLevel;
  /** Set until they replace a temporary password; the console refuses them until then. */
  mustChangePassword: boolean;
}

/** The level a stored role names exactly, or null. A comma-joined list of roles is no level. */
export function platformStaffLevelOf(role: string | null | undefined): PlatformStaffLevel | null {
  if (role === platformStaffRoles.support) return "support";
  if (role === platformStaffRoles["super-admin"]) return "super-admin";
  return null;
}

/**
 * Platform staff (spec 6.1): a platform role and no membership in any organization, ever. The role is read from the
 * database, never taken from the caller. The caller's `role` is ignored; only `id` says which user to check.
 */
export async function isPlatformAdmin(
  database: IdentityDatabase,
  user: { id: string; role?: string | null | undefined },
): Promise<boolean> {
  return isPlatformAdminUser(database.client, user.id);
}

/** The same check for code that has only the client, such as Better Auth's hooks. */
export async function isPlatformAdminUser(client: IdentityClient, userId: string): Promise<boolean> {
  return (await describePlatformStaff(client, userId)) !== null;
}

/** The person's platform level and name, or null when they are not platform staff (or have ever been a member). */
export async function describePlatformStaff(
  client: IdentityClient,
  userId: string,
): Promise<PlatformStaffMember | null> {
  const stored = await client.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, mustChangePassword: true },
  });
  const level = platformStaffLevelOf(stored?.role);
  if (!stored || level === null || (await hasEverBeenMember(client, userId))) return null;
  return { userId, name: stored.name, level, mustChangePassword: stored.mustChangePassword };
}

/** True for anyone who has a membership row, removed ones included (member rows are soft-deleted, never erased). */
export async function hasEverBeenMember(client: IdentityClient, userId: string): Promise<boolean> {
  const membership = await withDeleted(() => client.member.findUnique({ where: { userId } }));
  return membership !== null;
}

/**
 * True for an active member: a membership that isn't removed, and a user who isn't banned (removed staff are). Support
 * impersonates only these, so every impersonation has an organization's audit log to be recorded in.
 */
export async function isActiveMemberUser(client: IdentityClient, userId: string): Promise<boolean> {
  // Soft delete hides removed members.
  const member = await client.member.findUnique({
    where: { userId },
    select: { user: { select: { banned: true, banExpires: true } } },
  });
  return member !== null && !isBannedNow(member.user);
}
