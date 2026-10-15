// Public API of the identity module: permissions, roles, staff and sign-in. Other modules import only from here.
export {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "./access-rules.js";
export type { RoleFacts } from "./access-rules.js";
export type { AccessSession, SignedInSession } from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
export type { PasswordResetEmail, SendPasswordResetEmail } from "./auth/password-reset.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export { organizationTimeZone } from "./organization-profile.js";
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
export type { CreatedStaff } from "./staff-accounts.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
