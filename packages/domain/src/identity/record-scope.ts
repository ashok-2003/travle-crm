// Check 5 of spec 6.5: a view permission's scope limits a member to the records assigned to them, or lets them see all.
// Procedures check requires() first (check 4): a member without the procedure's permission, the view permission for a
// list or a read, is refused with FORBIDDEN before these run. Here, a record out of scope fails check 5 with NOT_FOUND.
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import type { ScopedPermission } from "./permissions.js";

/**
 * A where-clause fragment that limits a list to the records the member may see:
 * `tx.lead.findMany({ where: { ...scopeFilter(access, "leads:view", "assignedToId") } })`.
 * Without the view permission at all it throws FORBIDDEN (check 4), in case a procedure required something else.
 */
export function scopeFilter<Field extends string>(
  access: MemberAccess,
  permission: ScopedPermission,
  ownerField: Field,
): Partial<Record<Field, string>> {
  const scope = access.permissions.scopeOf(permission);
  if (scope === null) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", `Requires ${permission}`);
  }
  return scope === "all" ? {} : ({ [ownerField]: access.userId } as Partial<Record<Field, string>>);
}

/**
 * Treats a record outside the member's scope as missing (spec 6.5: check 5 fails with "not found"). Read, edit and
 * delete handlers all call it with the record's view permission (`leads:view` for a lead edit too): edit and delete
 * permissions carry no scope of their own. A member who may edit but not view gets NOT_FOUND, as for any record they
 * can't see.
 */
export function assertRecordInScope(
  access: MemberAccess,
  permission: ScopedPermission,
  ownerUserId: string | null,
): void {
  const scope = access.permissions.scopeOf(permission);
  if (scope === "all") return;
  if (scope === "own" && ownerUserId === access.userId) return;
  throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
}
