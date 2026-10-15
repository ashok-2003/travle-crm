// What the roles editor holds while someone changes a role: the permissions it grants, and for view permissions
// whose records they cover (spec 6.5: own or all). Pure functions, so the editor's rules are tested on their own.
import type {
  PermissionCatalogEntry,
  PermissionGrant,
  PermissionGrantInput,
  PermissionScope,
} from "@travel-crm/contracts/identity";

export type Grant = PermissionGrant;

/** The catalog grouped by module ("leads", "staff"...), modules and permissions in the catalog's order. */
export function byModule(catalog: PermissionCatalogEntry[]): { module: string; entries: PermissionCatalogEntry[] }[] {
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of catalog) groups.set(entry.module, [...(groups.get(entry.module) ?? []), entry]);
  return [...groups].map(([module, entries]) => ({ module, entries }));
}

/** Grants or takes away a permission. A view permission starts with the member's own records: the narrower one. */
export function toggle(grants: Grant[], entry: PermissionCatalogEntry, granted: boolean): Grant[] {
  const without = grants.filter((grant) => grant.permission !== entry.permission);
  if (!granted) return without;
  if (without.length < grants.length) return grants;
  return [...grants, { permission: entry.permission, scope: entry.scoped ? "own" : null }];
}

export function setScope(grants: Grant[], permission: string, scope: PermissionScope): Grant[] {
  return grants.map((grant) => (grant.permission === permission ? { ...grant, scope } : grant));
}

/** The grants as the api takes them: a scope only on the permissions that have one. */
export function toGrantInputs(grants: Grant[]): PermissionGrantInput[] {
  return grants.map(({ permission, scope }) => (scope === null ? { permission } : { permission, scope }));
}
