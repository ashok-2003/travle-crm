// Identity's part of permanent deletion (spec 5): erasing one removed person on a DPDP request, and the people of an
// organization being purged. Only the platform role runs these, in the console's purge and erasure jobs; the runtime
// role can't delete users' passwords or rename removed people this way.
import { withDeleted } from "@travel-crm/db";
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { shownEmail } from "./sign-in-names.js";

/** What an erased person's user row keeps: an id the audit log and other records still point to, and nothing else. */
const ERASED_NAME = "Erased person";
const erasedEmail = (userId: string) => `erased-${userId}@no-email.invalid`;

/** A person's sign-in data, for the export made before they are erased. */
export interface PersonExport {
  memberId: string;
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  joinedAt: string;
  removedAt: string | null;
}

/** The member of `organizationId`, removed or not, with their user. */
async function memberOf(tx: IdentityTx, organizationId: string, memberId: string) {
  const member = await withDeleted(() =>
    tx.member.findFirst({ where: { id: memberId, organizationId }, include: { user: true } }),
  );
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such person in this organization");
  return member;
}

export async function personExport(tx: IdentityTx, organizationId: string, memberId: string): Promise<PersonExport> {
  const member = await memberOf(tx, organizationId, memberId);
  return {
    memberId: member.id,
    userId: member.userId,
    name: member.user.name,
    // A removed person's current address is a placeholder; their own one is kept as the former email.
    email: shownEmail(member.user.formerEmail ?? member.user.email),
    username: member.user.displayUsername,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    removedAt: member.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Erases a removed person's sign-in data: name, addresses and usernames on the user row; their password, sessions,
 * two-factor secret and reset tokens. The rows that point at them (the membership, audit entries) keep the ids,
 * which now lead nowhere personal. Someone still a member must be removed first. Erasing twice changes nothing.
 * Returns the user's id, for the other modules' parts of the erasure.
 */
export async function erasePerson(
  tx: IdentityTx,
  organizationId: string,
  memberId: string,
): Promise<{ userId: string }> {
  const member = await memberOf(tx, organizationId, memberId);
  if (member.deletedAt === null) {
    throw new DomainError("CONFLICT", "REMOVE_FIRST", "Remove this person from the organization before erasing them");
  }
  const { userId } = member;
  await tx.user.update({
    where: { id: userId },
    data: {
      name: ERASED_NAME,
      email: erasedEmail(userId),
      formerEmail: null,
      username: null,
      displayUsername: null,
      image: null,
      banned: true,
      banReason: "Erased",
    },
  });
  await tx.account.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.twoFactor.deleteMany({ where: { userId } });
  // Better Auth's reset tokens name the user in their value.
  await tx.verification.deleteMany({ where: { value: userId } });
  return { userId };
}

/** Every user who has ever been a member of the organization: whose rows a purge deletes. */
export async function organizationUserIds(tx: IdentityTx, organizationId: string): Promise<string[]> {
  const members = await withDeleted(() => tx.member.findMany({ where: { organizationId }, select: { userId: true } }));
  return members.map((member) => member.userId);
}

/**
 * Deletes the users outright, with what hangs off them (their sessions, password accounts, two-factor secrets and
 * membership, by the user table's own cascades) and their reset tokens. For the organization purge only.
 */
export async function deleteUsers(tx: IdentityTx, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  await tx.verification.deleteMany({ where: { value: { in: [...userIds] } } });
  const { count } = await tx.user.deleteMany({ where: { id: { in: [...userIds] } } });
  return count;
}
