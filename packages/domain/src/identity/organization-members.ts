// An organization's active staff as the platform console lists them (spec 6.1: support impersonates one of them, and
// resends an invite to an Owner who hasn't chosen a password): who they are, their role, whether they have a password
// yet, and when they last used the app. Read inside the organization (asOrganization), oldest member first.
import type { IdentityTx } from "@travel-crm/db/identity";
import { shownEmail } from "./sign-in-names.js";

interface OrganizationMemberRecord {
  memberId: string;
  userId: string;
  name: string;
  /** Null for staff without email: their placeholder address is never shown. */
  email: string | null;
  roleName: string;
  isOwner: boolean;
  /** False until an invited person chooses a password from their invite. */
  hasPassword: boolean;
  /** When they last made a request, support's impersonation aside, to the day; null before their first. */
  lastActiveAt: Date | null;
}

/** The organization's members, removed and banned ones left out, as support may impersonate only active staff. */
export async function organizationMembers(tx: IdentityTx, organizationId: string): Promise<OrganizationMemberRecord[]> {
  // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
  const members = await tx.member.findMany({
    where: {
      organizationId,
      // Banned as resolveAccess sees it: banned, and the ban has no end or hasn't ended yet.
      NOT: { user: { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: new Date() } }] } },
    },
    select: {
      id: true,
      userId: true,
      role: true,
      lastActiveAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const roles = new Map((await tx.role.findMany({ where: { organizationId } })).map((role) => [role.key, role]));
  const withPassword = new Set(
    (
      await tx.account.findMany({
        where: {
          userId: { in: members.map((member) => member.userId) },
          providerId: "credential",
          password: { not: null },
        },
        select: { userId: true },
      })
    ).map((account) => account.userId),
  );
  return members.map((member) => {
    const role = roles.get(member.role);
    return {
      memberId: member.id,
      userId: member.userId,
      name: member.user.name,
      email: shownEmail(member.user.email),
      roleName: role?.name ?? member.role,
      isOwner: role?.isOwner ?? false,
      hasPassword: withPassword.has(member.userId),
      lastActiveAt: member.lastActiveAt,
    };
  });
}
