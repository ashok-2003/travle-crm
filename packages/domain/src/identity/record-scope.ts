// Check 5 of spec 6.5: a view permission's scope limits a member to the records assigned to them, or lets them see all.
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import type { ScopedPermission } from "./permissions.js";

/**
 * A where-clause fragment that limits a list to the records the member may see:
 * `tx.lead.findMany({ where: { ...scopeFilter(access, "leads:view", "assignedToId") } })`.
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

/** Treats a record outside the member's scope as missing (spec 6.5: check 5 fails with "not found"). */
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
