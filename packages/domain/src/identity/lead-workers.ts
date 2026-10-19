// The people who can work leads (R14): active members whose role is the Owner's or lets them see leads, for the owner
// and assignee pickers; and the agency's first Owner (R15), who receives a departing member's work. Names only: other
// modules never read the sign-in tables.
import type { LeadWorker } from "@travel-crm/contracts/crm";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { PermissionSet } from "./permission-set.js";

const byName = new Intl.Collator("en-IN", { sensitivity: "base" });

/** Banned as resolveAccess sees it: banned, and the ban has no end or hasn't ended yet. */
export const notBanned = () => ({
  NOT: { user: { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: new Date() } }] } },
});

/** The keys of the organization's roles that are the Owner's, and of those that grant leads:view. */
export async function roleKeys(
  tx: IdentityTx,
  organizationId: string,
): Promise<{ owner: Set<string>; leads: Set<string> }> {
  const roles = await tx.role.findMany({ where: { organizationId }, include: { permissions: true } });
  const owner = new Set(roles.filter((role) => role.isOwner).map((role) => role.key));
  const leads = new Set(
    roles
      .filter((role) => role.isOwner || PermissionSet.fromStored(role.permissions).has("leads:view"))
      .map((role) => role.key),
  );
  return { owner, leads };
}

/** Everyone who can own a lead or be given its tasks, by name. */
export async function leadWorkers(database: IdentityDatabase, organizationId: string): Promise<LeadWorker[]> {
  return database.forOrg(organizationId, async (tx) => {
    const { leads } = await roleKeys(tx, organizationId);
    // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
    const members = await tx.member.findMany({
      where: { organizationId, role: { in: [...leads] }, ...notBanned() },
      select: { userId: true, user: { select: { name: true } } },
    });
    return members
      .map((member) => ({ userId: member.userId, name: member.user.name }))
      .sort((a, b) => byName.compare(a.name, b.name) || a.userId.localeCompare(b.userId));
  });
}

/** The earliest-joined active member on an Owner role, or null when there is none. */
export async function firstOwner(database: IdentityDatabase, organizationId: string): Promise<string | null> {
  return database.forOrg(organizationId, async (tx) => {
    const { owner } = await roleKeys(tx, organizationId);
    const first = await tx.member.findFirst({
      where: { organizationId, role: { in: [...owner] }, ...notBanned() },
      select: { userId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return first?.userId ?? null;
  });
}
