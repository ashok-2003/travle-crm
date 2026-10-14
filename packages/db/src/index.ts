// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
export { isUniqueViolation } from "./errors.js";
export {
  InvalidOrganizationIdError,
  NestedForOrgError,
  WrongDatabaseRoleError,
  type ForOrgOptions,
  type OrgTx,
} from "./for-org.js";
export { SignInRelationError } from "./sign-in-guard.js";
export { HardDeleteError, SoftDeleteUpsertError, softDeleted, withDeleted } from "./soft-delete.js";
export type { Organization, OrgCounter, Role, RolePermission } from "./generated/prisma/client.js";
