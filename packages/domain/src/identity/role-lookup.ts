// Finds a role of the transaction's organization by key, with what it allows.
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
  if (!role) throw new DomainError("NOT_FOUND", "ROLE_NOT_FOUND", `No role ${key}`);
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    isOwner: role.isOwner,
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
  };
}
