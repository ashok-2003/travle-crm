// Helpers for unit tests of the identity rules, which need no database.
import { DomainError } from "../../src/kernel/errors.js";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { starterRoles } from "../../src/identity/starter-roles.js";

/** A member holding one of the starter roles, e.g. memberWithStarterRole("sales"). */
export function memberWithStarterRole(key: string, overrides: Partial<MemberAccess> = {}): MemberAccess {
  const role = starterRoles.find((starter) => starter.key === key);
  if (!role) throw new Error(`No starter role ${key}`);
  return {
    userId: `user-${key}`,
    memberId: `member-${key}`,
    organizationId: "organization-1",
    source: "web",
    impersonatedBy: null,
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.of(role.grants),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
    ...overrides,
  };
}

/** Runs a rule and returns the reason it refused, or null when it allowed the action. */
export function refusalOf<Args extends unknown[]>(rule: (...args: Args) => void, ...args: Args): string | null {
  try {
    rule(...args);
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error.reason;
    throw error;
  }
}
