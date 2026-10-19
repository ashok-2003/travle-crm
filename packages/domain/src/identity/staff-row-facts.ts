// What the staff import's check (B44) and preview (B45) need to know of the agency, answered inside identity so that
// names, usernames and emails never leave it: which of a file's usernames and emails are already active members, which
// emails sit on another organization's account, which roles the importer may give, and how many seats are free.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { internalUsername } from "./sign-in-names.js";
import type { SeatLimit } from "./staff.js";

export interface StaffRowFacts {
  /** The file's usernames, in lower case as typed, that an active member here already has. */
  activeUsernames: ReadonlySet<string>;
  /** The file's emails, in lower case, that an active member here already has. */
  activeEmails: ReadonlySet<string>;
  /** The file's emails, in lower case, that belong to an account that isn't an active member here. */
  emailsElsewhere: ReadonlySet<string>;
  /** Every role of the agency: whether it is the Owner's, and whether the importer may give it (B44). */
  roles: ReadonlyMap<string, { isOwner: boolean; mayGive: boolean }>;
}

const mayGive = (actor: MemberAccess, role: { isOwner: boolean; permissions: PermissionSet }): boolean => {
  try {
    assertMayHandleRole(actor, role);
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
};

export async function staffRowFacts(
  database: IdentityDatabase,
  actor: MemberAccess,
  names: { usernames: readonly string[]; emails: readonly string[] },
): Promise<StaffRowFacts> {
  return database.forOrg(actor.organizationId, async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
    const usernames = new Map(
      names.usernames.map((username) => [internalUsername(organization.code, username), username.toLowerCase()]),
    );
    const emails = [...new Set(names.emails.map((email) => email.toLowerCase()))];
    const users =
      usernames.size + emails.length === 0
        ? []
        : await tx.user.findMany({
            where: { OR: [{ username: { in: [...usernames.keys()] } }, { email: { in: emails } }] },
            select: { id: true, username: true, email: true },
          });
    // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
    const members = await tx.member.findMany({
      where: { organizationId: actor.organizationId, userId: { in: users.map((user) => user.id) } },
      select: { userId: true },
    });
    const active = new Set(members.map((member) => member.userId));
    const activeUsernames = new Set<string>();
    const activeEmails = new Set<string>();
    const emailsElsewhere = new Set<string>();
    for (const user of users) {
      const typed = user.username === null ? undefined : usernames.get(user.username);
      if (typed !== undefined && active.has(user.id)) activeUsernames.add(typed);
      if (emails.includes(user.email)) (active.has(user.id) ? activeEmails : emailsElsewhere).add(user.email);
    }
    const roles = await tx.role.findMany({ include: { permissions: true } });
    return {
      activeUsernames,
      activeEmails,
      emailsElsewhere,
      roles: new Map(
        roles.map((role) => [
          role.key,
          {
            isOwner: role.isOwner,
            mayGive: mayGive(actor, {
              isOwner: role.isOwner,
              permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
            }),
          },
        ]),
      ),
    };
  });
}

/** The seats the plan has left, or null for no limit. A forecast for the preview: the add counts under a lock. */
export async function staffSeatsFree(
  database: IdentityDatabase,
  seatLimit: SeatLimit,
  organizationId: string,
): Promise<number | null> {
  const seats = await seatLimit(organizationId);
  if (seats === null) return null;
  const used = await database.forOrg(organizationId, (tx) => tx.member.count({ where: { organizationId } }));
  return Math.max(0, seats - used);
}
