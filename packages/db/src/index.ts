// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
export { InvalidOrganizationIdError, WrongDatabaseRoleError, type OrgTx } from "./for-org.js";
export type { Organization, OrgCounter } from "./generated/prisma/client.js";
