// Finds a role of the transaction's organization by key, with what it allows: a role about to be given, held until the
// transaction ends, or the role a member has now, even if it was deleted since.
import { withDeleted } from "@travel-crm/db";
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import type { RoleFacts } from "./access-rules.js";
import { PermissionSet } from "./permission-set.js";

export interface FoundRole extends RoleFacts {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

/** Throws NOT_FOUND when the organization has no such role, or it was deleted. */
export async function findRole(tx: IdentityTx, key: string): Promise<FoundRole> {
  const role = await tx.role.findFirst({ where: { key }, include: { permissions: true } });
  if (!role) throw roleNotFound(key);
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    isOwner: role.isOwner,
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
  };
}

/**
 * A role about to be given to someone, held (FOR SHARE) until the transaction ends. A simultaneous deleteRole or
 * updateRole holds the row FOR UPDATE, so this waits for it and then reads what it left: nobody lands on a deleted role
 * or keeps a role that was widened past what the giver may hand out.
 */
export async function findRoleToGive(tx: IdentityTx, key: string): Promise<FoundRole> {
  const kept = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "role" WHERE key = ${key} AND deleted_at IS NULL FOR SHARE`;
  if (kept.length === 0) throw roleNotFound(key);
  return findRole(tx, key);
}

/**
 * The role a member has now, even if it was deleted since, so a member left on a deleted role can still be moved or
 * removed. Its permission rows stay, so the no-escalation checks still see what it allowed.
 */
export async function findCurrentRole(tx: IdentityTx, key: string): Promise<FoundRole> {
  return withDeleted(() => findRole(tx, key));
}

function roleNotFound(key: string): DomainError {
  return new DomainError("NOT_FOUND", "ROLE_NOT_FOUND", `No role ${key}`);
}
