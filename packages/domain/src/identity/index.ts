// Public API of the identity module: permissions, roles, staff and sign-in. Other modules import only from here.
export {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "./access-rules.js";
export type { RoleFacts } from "./access-rules.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { PermissionSet, type Grant } from "./permission-set.js";
export {
  isPermission,
  isScopedPermission,
  moduleOf,
  permissionCatalog,
  permissions,
  type Permission,
  type ScopedPermission,
  type UnscopedPermission,
} from "./permissions.js";
export { assertRecordInScope, scopeFilter } from "./record-scope.js";
export { roleKeyFor } from "./role-key.js";
export {
  INTERNAL_USERNAME_PATTERN,
  internalUsername,
  isPlaceholderEmail,
  placeholderEmail,
  removedPersonEmail,
  shownEmail,
} from "./sign-in-names.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
