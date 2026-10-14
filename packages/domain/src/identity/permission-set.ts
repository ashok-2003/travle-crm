// A role's permissions as a set, with the scope of each view permission. The Owner's set holds everything.
import type { PermissionScope } from "@travel-crm/contracts/identity";
import {
  isPermission,
  isScopedPermission,
  permissions,
  type Permission,
  type ScopedPermission,
} from "./permissions.js";

/** One permission and, for view permissions, its scope. */
export interface Grant {
  permission: Permission;
  scope: PermissionScope | null;
}

export class PermissionSet {
  private readonly scopes: ReadonlyMap<Permission, PermissionScope | null>;

  private constructor(grants: Iterable<Grant>) {
    this.scopes = new Map([...grants].map((grant) => [grant.permission, normalScope(grant)]));
  }

  static of(grants: Iterable<Grant>): PermissionSet {
    return new PermissionSet(grants);
  }

  /** Every permission in the catalog, view permissions over all records: the Owner role. */
  static everything(): PermissionSet {
    return new PermissionSet(permissions.map((permission) => ({ permission, scope: "all" })));
  }

  /** Rows read from role_permission. Permissions no longer in the catalog are ignored. */
  static fromStored(rows: Iterable<{ permission: string; scope: string | null }>): PermissionSet {
    const grants: Grant[] = [];
    for (const row of rows) {
      if (isPermission(row.permission)) {
        grants.push({
          permission: row.permission,
          scope: row.scope === "all" ? "all" : row.scope === "own" ? "own" : null,
        });
      }
    }
    return new PermissionSet(grants);
  }

  has(permission: Permission): boolean {
    return this.scopes.has(permission);
  }

  /** The permissions in `required` that this set lacks. */
  missing(required: readonly Permission[]): Permission[] {
    return required.filter((permission) => !this.has(permission));
  }

  /** The scope of a view permission, or null when it is not held. */
  scopeOf(permission: ScopedPermission): PermissionScope | null {
    return this.scopes.get(permission) ?? null;
  }

  /** True when this set holds every permission in `other`, each with at least the same scope. */
  covers(other: PermissionSet): boolean {
    for (const [permission, scope] of other.scopes) {
      if (!this.scopes.has(permission)) return false;
      if (scope === "all" && this.scopes.get(permission) !== "all") return false;
    }
    return true;
  }

  /** The grants in catalog order, as the API returns them. */
  toGrants(): Grant[] {
    return permissions
      .filter((permission) => this.scopes.has(permission))
      .map((permission) => ({ permission, scope: this.scopes.get(permission) ?? null }));
  }
}

/** View permissions always have a scope (missing means the narrower "own"); other permissions never do. */
function normalScope(grant: Grant): PermissionScope | null {
  if (!isScopedPermission(grant.permission)) return null;
  return grant.scope ?? "own";
}
