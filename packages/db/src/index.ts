// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
export { isUniqueViolation, UnscopedModelError } from "./errors.js";
export {
  InvalidOrganizationIdError,
  NestedForOrgError,
  WrongDatabaseRoleError,
  type ForOrgOptions,
  type OrgTx,
} from "./for-org.js";
export { insideOrganization } from "./session.js";
export { SignInRelationError } from "./sign-in-guard.js";
export { emptySql, joinSql, sql, type Sql } from "./sql.js";
export { HardDeleteError, SoftDeleteUpsertError, softDeleted, withDeleted } from "./soft-delete.js";
export type { Organization, OrgCounter, Role, RolePermission } from "./generated/prisma/client.js";
