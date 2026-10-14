// An organization's staff (spec 6.3): list them, add them with or without email, change their role, reset their
// password, remove them. The API checks staff:manage (request check 4) on a fresh session before calling these.
import type {
  CreateStaffInput,
  RemoveStaffInput,
  ResetStaffPasswordInput,
  StaffMember,
  UpdateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { softDeleted } from "@travel-crm/db";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole, assertMayManageMember } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { findCurrentRole, findRoleToGive } from "./role-lookup.js";
import { isPlaceholderEmail, removedPersonEmail, shownEmail } from "./sign-in-names.js";
import { createStaffAccount, type PasswordHasher } from "./staff-accounts.js";
import { changeMember, lockMember, lockOwners } from "./staff-locks.js";

/** The organization's active staff, oldest first. Placeholder emails are never shown. */
export async function listStaff(database: IdentityDatabase, actor: MemberAccess): Promise<StaffMember[]> {
  return database.forOrg(actor.organizationId, async (tx) => {
    // The member table has no row-level security, so the organization is filtered here.
    const members = await tx.member.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const roleNames = new Map((await tx.role.findMany()).map((role) => [role.key, role.name]));
    return members.map((member) => ({
      memberId: member.id,
      userId: member.userId,
      name: member.user.name,
      email: shownEmail(member.user.email),
      username: member.user.displayUsername,
      role: { key: member.role, name: roleNames.get(member.role) ?? member.role },
      twoFactorEnabled: member.user.twoFactorEnabled ?? false,
      mustChangePassword: member.user.mustChangePassword,
      joinedAt: member.createdAt.toISOString(),
    }));
  });
}

/** Adds a staff member with a temporary password they must change at first sign-in. */
export async function createStaff(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  actor: MemberAccess,
  input: CreateStaffInput,
): Promise<StaffMember> {
  const created = await createStaffAccount(
    database,
    hashPassword,
    {
      organizationId: actor.organizationId,
      name: input.name,
      email: input.email,
      username: input.username,
      roleKey: input.roleKey,
      password: input.temporaryPassword,
      mustChangePassword: true,
    },
    // Checked inside the transaction that adds the person, on the role as it is once held.
    (role) => {
      assertMayHandleRole(actor, role);
    },
  );
  return staffMember(database, actor, created.memberId);
}

export async function updateStaffRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: UpdateStaffRoleInput,
): Promise<StaffMember> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    const targetRole = await findCurrentRole(tx, target.role);
    assertMayManageMember(actor, { userId: target.userId, role: targetRole });
    if (targetRole.isOwner) await lockOwners(tx, actor, target.id, targetRole.key);
    const newRole = await findRoleToGive(tx, input.roleKey);
    assertMayHandleRole(actor, newRole);
    await changeMember(tx, target, { role: newRole.key });
  });
  return staffMember(database, actor, input.memberId);
}

/** Sets a temporary password, which must be changed at next sign-in, and signs the person out everywhere. */
export async function resetStaffPassword(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  actor: MemberAccess,
  input: ResetStaffPasswordInput,
): Promise<void> {
  const passwordHash = await hashPassword(input.temporaryPassword);
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    const targetRole = await findCurrentRole(tx, target.role);
    assertMayManageMember(actor, { userId: target.userId, role: targetRole });
    // Locked in the same order as the other staff changes, so a promotion or removal landing now can't slip past.
    if (targetRole.isOwner) await lockOwners(tx, actor, target.id, targetRole.key);
    await lockMember(tx, target);
    const { count } = await tx.account.updateMany({
      where: { userId: target.userId, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (count !== 1)
      throw new Error(`Expected one credential account for user ${target.userId}, found ${String(count)}`);
    await tx.user.update({ where: { id: target.userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: target.userId } });
  });
}

/**
 * Removes a person from the organization (ADR 0007): their membership is soft-deleted, their sessions end, and their
 * email and username are released so they can be used again, by this organization or another.
 */
export async function removeStaff(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: RemoveStaffInput,
): Promise<void> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    const targetRole = await findCurrentRole(tx, target.role);
    assertMayManageMember(actor, { userId: target.userId, role: targetRole });
    if (targetRole.isOwner) await lockOwners(tx, actor, target.id, targetRole.key);
    await changeMember(tx, target, softDeleted(actor.userId));
    const user = await tx.user.findUniqueOrThrow({ where: { id: target.userId } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        formerEmail: isPlaceholderEmail(user.email) ? null : user.email,
        email: removedPersonEmail(user.id),
        username: null,
        // Better Auth refuses to create a session for a banned user. With the password wiped below, either one alone
        // refuses sign-in.
        banned: true,
        banReason: "Removed from their organization",
      },
    });
    // The retired address can be worked out from the user id, so the old password must stop working too.
    await tx.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
}

/** An active member of the actor's organization. Members of other organizations are "not found". */
async function findMember(tx: IdentityTx, actor: MemberAccess, memberId: string) {
  const member = await tx.member.findFirst({ where: { id: memberId, organizationId: actor.organizationId } });
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  return member;
}

async function staffMember(database: IdentityDatabase, actor: MemberAccess, memberId: string): Promise<StaffMember> {
  const member = (await listStaff(database, actor)).find((staff) => staff.memberId === memberId);
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  return member;
}
