// Inputs and outputs of the roles API: roles are named sets of permissions in one organization (spec 6.5).
import { z } from "zod";
import { roleKey, roleName } from "./fields.js";

/** For view permissions: only the records assigned to the member, or all of them. */
export const permissionScope = z.enum(["own", "all"]);
export type PermissionScope = z.infer<typeof permissionScope>;

/** A permission key such as "leads:create". The domain checks that it is in the permission catalog. */
export const permissionKey = z.string().regex(/^[a-z_]+:[a-z_]+$/);

/** A permission to grant. View permissions need a scope; the domain rejects a scope on any other permission. */
export const permissionGrantInput = z.object({
  permission: permissionKey,
  scope: permissionScope.optional(),
});
export type PermissionGrantInput = z.infer<typeof permissionGrantInput>;

const permissionGrantList = z
  .array(permissionGrantInput)
  .max(100)
  .refine((grants) => new Set(grants.map((grant) => grant.permission)).size === grants.length, {
    message: "List each permission once",
  });

/** A granted permission as the API returns it. */
export const permissionGrant = z.object({
  permission: z.string(),
  scope: permissionScope.nullable(),
});
export type PermissionGrant = z.infer<typeof permissionGrant>;

export const createRoleInput = z.object({ name: roleName, permissions: permissionGrantList });
export type CreateRoleInput = z.infer<typeof createRoleInput>;

/** Change a role's name, its permissions, or both. Leave a field out to keep it. */
export const updateRoleInput = z.object({
  key: roleKey,
  name: roleName.optional(),
  permissions: permissionGrantList.optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleInput>;

export const deleteRoleInput = z.object({ key: roleKey });
export type DeleteRoleInput = z.infer<typeof deleteRoleInput>;

export const roleSummary = z.object({
  key: z.string(),
  name: z.string(),
  /** The Owner role holds every permission and cannot be changed. */
  isOwner: z.boolean(),
  permissions: z.array(permissionGrant),
  /** Staff currently given this role. A role with staff cannot be deleted. */
  memberCount: z.number().int().nonnegative(),
});
export type RoleSummary = z.infer<typeof roleSummary>;

/** One entry of the permission catalog, for the roles editor. Labels come from the web app's translations. */
export const permissionCatalogEntry = z.object({
  permission: z.string(),
  /** The part before the colon, e.g. "leads". Screens group permissions by it. */
  module: z.string(),
  /** True for view permissions, which take a scope. */
  scoped: z.boolean(),
});
export type PermissionCatalogEntry = z.infer<typeof permissionCatalogEntry>;
