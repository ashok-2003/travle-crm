// The row locks behind every staff change (ADR 0007): the organization's Owners first when an Owner is the target,
// then the target's own member row, so a change that landed after the checks makes this one fail with STAFF_CHANGED.
import type { softDeleted } from "@travel-crm/db";
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";

/**
 * Locks the organization's active Owners (in id order, so two changes can't deadlock) before one of them is removed,
 * demoted or given a new password. If the actor was removed or demoted in the meantime they can no longer do this, and
 * an Owner must remain. The member table has no row-level security, so the organization is filtered here.
 */
export async function lockOwners(
  tx: IdentityTx,
  actor: MemberAccess,
  targetMemberId: string,
  ownerKey: string,
): Promise<void> {
  const owners = await tx.$queryRaw<{ id: string; user_id: string }[]>`
    SELECT id, user_id FROM member
    WHERE organization_id = ${actor.organizationId}::uuid AND role = ${ownerKey} AND deleted_at IS NULL
    ORDER BY id FOR UPDATE`;
  if (!owners.some((owner) => owner.user_id === actor.userId)) {
    throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner can change an Owner");
  }
  if (!owners.some((owner) => owner.id === targetMemberId)) {
    throw staffChanged();
  }
  if (owners.every((owner) => owner.id === targetMemberId)) {
    throw new DomainError("CONFLICT", "LAST_OWNER", "The organization must keep an Owner");
  }
}

/**
 * Holds the member row until the transaction ends, if the member still has the role the checks were made against.
 * For changes that write elsewhere (a password reset): a promotion or a removal that lands meanwhile then waits for
 * this change, or this change waits for it and fails.
 */
export async function lockMember(tx: IdentityTx, target: { id: string; role: string }): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM member WHERE id = ${target.id}::uuid AND role = ${target.role} AND deleted_at IS NULL FOR UPDATE`;
  if (locked.length === 0) throw staffChanged();
}

/**
 * Writes only if the member still has the role the checks were made against, so a promotion that landed after they
 * were read can't be overwritten by someone with less access than the new role.
 */
export async function changeMember(
  tx: IdentityTx,
  target: { id: string; role: string },
  data: { role: string } | ReturnType<typeof softDeleted>,
): Promise<void> {
  const { count } = await tx.member.updateMany({ where: { id: target.id, role: target.role, deletedAt: null }, data });
  if (count !== 1) throw staffChanged();
}

export function staffChanged(): DomainError {
  return new DomainError("CONFLICT", "STAFF_CHANGED", "This person was changed by someone else. Reload and try again.");
}
