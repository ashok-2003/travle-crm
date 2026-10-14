// Rules for changing who can do what (spec 6.3, 6.5). Nobody can hand out more than they hold, nobody can change
// their own access, and only an Owner can make or change an Owner, so every organization keeps one.
import type { PermissionGrantInput } from "@travel-crm/contracts/identity";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import { PermissionSet, type Grant } from "./permission-set.js";
import { isPermission, isScopedPermission } from "./permissions.js";

/** What the rules need to know about a role. */
export interface RoleFacts {
  readonly isOwner: boolean;
  readonly permissions: PermissionSet;
}

/** Turns requested grants into a PermissionSet, refusing unknown permissions and scopes that don't fit. */
export function permissionSetFromInput(grants: readonly PermissionGrantInput[]): PermissionSet {
  const checked: Grant[] = grants.map(({ permission, scope }) => {
    if (!isPermission(permission)) {
      throw new DomainError("VALIDATION", "UNKNOWN_PERMISSION", `Unknown permission ${permission}`);
    }
    if (isScopedPermission(permission) && scope === undefined) {
      throw new DomainError("VALIDATION", "SCOPE_REQUIRED", `${permission} needs a scope: own or all`);
    }
    if (!isScopedPermission(permission) && scope !== undefined) {
      throw new DomainError("VALIDATION", "SCOPE_NOT_ALLOWED", `${permission} does not take a scope`);
    }
    return { permission, scope: scope ?? null };
  });
  return PermissionSet.of(checked);
}

/**
 * The actor may give, edit or take away a role only if they hold everything it allows. Only an Owner may touch the
 * Owner role. Owners hold everything, so this never limits them.
 */
export function assertMayHandleRole(actor: MemberAccess, role: RoleFacts): void {
  if (role.isOwner && !actor.role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner can give or change the Owner role");
  }
  if (!actor.permissions.covers(role.permissions)) {
    throw new DomainError("FORBIDDEN", "EXCEEDS_YOUR_PERMISSIONS", "That role allows more than you can");
  }
}

/**
 * The actor may change another member's role, reset their password or remove them only if they could have given
 * that member's role. Nobody changes their own access: an Owner who wants to step down asks another Owner.
 */
export function assertMayManageMember(actor: MemberAccess, target: { userId: string; role: RoleFacts }): void {
  if (target.userId === actor.userId) {
    throw new DomainError("FORBIDDEN", "CANNOT_CHANGE_YOURSELF", "You cannot change your own access");
  }
  assertMayHandleRole(actor, target.role);
}

/** The Owner role is fixed: it always holds every permission and is never renamed or deleted. */
export function assertRoleIsEditable(role: { isOwner: boolean }): void {
  if (role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ROLE_IS_FIXED", "The Owner role cannot be changed");
  }
}
