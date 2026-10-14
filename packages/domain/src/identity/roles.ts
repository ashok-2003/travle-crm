// An organization's roles (spec 6.5): list, create, change and delete them. The API checks roles:manage (request
// check 4) before calling the changes; these functions enforce the rules in access-rules.ts.
import type { CreateRoleInput, DeleteRoleInput, RoleSummary, UpdateRoleInput } from "@travel-crm/contracts/identity";
import { softDeleted } from "@travel-crm/db";
import { isUniqueViolation, type IdentityDatabase, type IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole, assertRoleIsEditable, permissionSetFromInput } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { roleKeyFor } from "./role-key.js";
import { findRole } from "./role-lookup.js";

/** The organization's roles, Owner first, with what each allows and how many staff have it. */
export async function listRoles(database: IdentityDatabase, actor: MemberAccess): Promise<RoleSummary[]> {
  return database.forOrg(actor.organizationId, async (tx) => {
    const roles = await tx.role.findMany({
      include: { permissions: true },
      orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    });
    const memberCounts = await countMembersByRole(tx, actor.organizationId);
    return roles.map((role) =>
      summarise(
        {
          ...role,
          permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
        },
        memberCounts.get(role.key) ?? 0,
      ),
    );
  });
}

export async function createRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: CreateRoleInput,
): Promise<RoleSummary> {
  const permissions = permissionSetFromInput(input.permissions);
  assertMayHandleRole(actor, { isOwner: false, permissions });
  return refusingDuplicateNames(
    database.forOrg(actor.organizationId, async (tx) => {
      await assertNameIsFree(tx, input.name);
      const role = await tx.role.create({ data: { key: roleKeyFor(input.name), name: input.name } });
      await replacePermissions(tx, role.id, permissions);
      return summarise({ ...role, permissions }, 0);
    }),
  );
}

export async function updateRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: UpdateRoleInput,
): Promise<RoleSummary> {
  return refusingDuplicateNames(
    database.forOrg(actor.organizationId, async (tx) => {
      const role = await findRole(tx, input.key);
      assertRoleIsEditable(role);
      // Nobody may edit a role that allows more than they hold, even to take permissions away.
      assertMayHandleRole(actor, role);
      let permissions = role.permissions;
      if (input.permissions !== undefined) {
        permissions = permissionSetFromInput(input.permissions);
        assertMayHandleRole(actor, { isOwner: false, permissions });
        await replacePermissions(tx, role.id, permissions);
      }
      let name = role.name;
      if (input.name !== undefined && input.name !== role.name) {
        await assertNameIsFree(tx, input.name, role.id);
        name = (await tx.role.update({ where: { id: role.id }, data: { name: input.name } })).name;
      }
      const memberCounts = await countMembersByRole(tx, actor.organizationId);
      return summarise({ ...role, name, permissions }, memberCounts.get(role.key) ?? 0);
    }),
  );
}

/**
 * Soft-deletes a role nobody has. Its name becomes free again; its key never does, so a member can never pick up a
 * later role through a reused key.
 */
export async function deleteRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: DeleteRoleInput,
): Promise<void> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const role = await findRole(tx, input.key);
    assertRoleIsEditable(role);
    assertMayHandleRole(actor, role);
    const members = await tx.member.count({ where: { organizationId: actor.organizationId, role: role.key } });
    if (members > 0) {
      throw new DomainError("CONFLICT", "ROLE_IN_USE", "Move the staff who have this role to another role first");
    }
    await tx.role.update({ where: { id: role.id }, data: softDeleted(actor.userId) });
  });
}

/**
 * Two people creating or renaming roles with one name at the same moment can both pass assertNameIsFree(); the
 * database's unique index then refuses the second, which is reported the same way. (So, about once in 16 million, is
 * a clash of a new key's random suffix.)
 */
async function refusingDuplicateNames<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "ROLE_NAME_TAKEN", "There is already a role with that name");
    }
    throw error;
  }
}

/** Role names are unique within an organization, ignoring case, among roles that are not deleted. */
async function assertNameIsFree(tx: IdentityTx, name: string, exceptRoleId?: string): Promise<void> {
  const clash = await tx.role.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptRoleId ? { id: { not: exceptRoleId } } : {}) },
  });
  if (clash) throw new DomainError("CONFLICT", "ROLE_NAME_TAKEN", `There is already a role called ${clash.name}`);
}

async function replacePermissions(tx: IdentityTx, roleId: string, permissions: PermissionSet): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  await tx.rolePermission.createMany({
    data: permissions.toGrants().map((grant) => ({ roleId, permission: grant.permission, scope: grant.scope })),
  });
}

/** Active members per role key. The member table has no row-level security, so the organization is filtered here. */
async function countMembersByRole(tx: IdentityTx, organizationId: string): Promise<Map<string, number>> {
  const groups = await tx.member.groupBy({ by: ["role"], where: { organizationId }, _count: { _all: true } });
  return new Map(groups.map((group) => [group.role, group._count._all]));
}

function summarise(
  role: { key: string; name: string; isOwner: boolean; permissions: PermissionSet },
  memberCount: number,
): RoleSummary {
  return {
    key: role.key,
    name: role.name,
    isOwner: role.isOwner,
    permissions: role.permissions.toGrants(),
    memberCount,
  };
}
