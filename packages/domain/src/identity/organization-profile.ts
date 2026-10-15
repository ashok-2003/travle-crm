// What other modules may know about an organization and its people. Only the identity module reads the sign-in
// tables (spec 4), so notifications, documents and the worker ask here.
import type { OrgTx } from "@travel-crm/db";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { shownEmail } from "./sign-in-names.js";

export interface OrganizationProfile {
  id: string;
  name: string;
  code: string;
  /** An IANA time zone such as "Asia/Kolkata": times are shown, and days counted, in it. */
  timeZone: string;
  /** Where replies to email sent for the organization go; null until onboarding sets it. */
  contactEmail: string | null;
}

/** A member as notifications need them. */
export interface MemberContact {
  userId: string;
  name: string;
  /** Null for staff without email: their placeholder address is never emailed. */
  email: string | null;
}

export async function organizationProfile(
  database: IdentityDatabase,
  organizationId: string,
): Promise<OrganizationProfile | null> {
  return database.client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, code: true, timeZone: true, contactEmail: true },
  });
}

/**
 * The organization's time zone, read inside the caller's transaction, so documents count their year and date in it
 * without taking it from the caller. The organization table has no row-level security, so this reads the id it is
 * given: pass the transaction's own organization.
 */
export async function organizationTimeZone(tx: OrgTx, organizationId: string): Promise<string> {
  // OrgTx hides the sign-in models; every forOrg() transaction is the same client underneath, and only this module
  // may reach the organization model.
  const organization = await (tx as IdentityTx).organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timeZone: true },
  });
  return organization.timeZone;
}

/**
 * The organization's active members among userIds. Anyone else (removed, banned, or in another organization) is left out,
 * so nobody is notified about an organization they have left.
 */
export async function memberContacts(
  database: IdentityDatabase,
  organizationId: string,
  userIds: readonly string[],
): Promise<MemberContact[]> {
  if (userIds.length === 0) return [];
  // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
  const members = await database.client.member.findMany({
    where: {
      organizationId,
      userId: { in: [...userIds] },
      // Banned like resolveAccess sees it: banned, and the ban has no end or hasn't ended yet.
      NOT: { user: { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: new Date() } }] } },
    },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
    email: shownEmail(member.user.email),
  }));
}
