// Public API of the identity module: permissions, roles, staff and sign-in. Other modules import only from here.
export {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "./access-rules.js";
export type { RoleFacts } from "./access-rules.js";
export {
  platformStaffLevelOf,
  platformStaffRoles,
  type AccessSession,
  type PlatformStaffMember,
  type SignedInSession,
} from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
export type { PasswordResetEmail, PasswordResetSettings, SendPasswordResetEmail } from "./auth/password-reset.js";
export { deleteUsers, erasePerson, organizationUserIds, personExport, type PersonExport } from "./erasure.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { memberActivity, recordMemberActivity, type MemberActivity } from "./member-activity.js";
export {
  addStaffWithPassword,
  createOrganizationRecord,
  inviteOwner,
  requestInvite,
  type NewOrganization,
} from "./onboarding.js";
export { organizationMembers, type OrganizationMemberRecord } from "./organization-members.js";
export type { MemberContact, OrganizationProfile } from "./organization-profile.js";
export {
  findOrganizationByCode,
  findOrganizationRecord,
  holdOrganizationRecord,
  listOrganizationRecords,
  updateOrganizationRecord,
  type OrganizationRecord,
} from "./organization-records.js";
export { organizationTimeZone } from "./organization-profile.js";
export { PermissionSet, type Grant } from "./permission-set.js";
export {
  changePlatformStaffLevel,
  createFirstSuperAdmin,
  createPlatformStaffAccount,
  removeFromPlatformStaff,
  replacePlatformStaffPassword,
  temporaryPassword,
  type NewPlatformStaff,
  type PlatformStaffActor,
} from "./platform-staff.js";
export { platformStaffAccounts, type PlatformStaffAccount } from "./platform-staff-list.js";
export type { EndedImpersonation } from "./platform-staff-sessions.js";
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
export { insertStarterRoles } from "./seed-starter-roles.js";
export type { CreatedStaff } from "./staff-accounts.js";
export type { SeatLimit } from "./staff.js";
export { INVITE_LINK_HOURS, SEND_INVITE_LISTENER, type InviteDependencies } from "./staff-invites.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
