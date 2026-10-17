// Test helpers for other packages: `import { createTestOrganization } from "@travel-crm/db/testing"`.
// Their vitest.config.ts runs "@travel-crm/db/testing/global-setup", which starts Postgres and provides inject("dbUrls").
export { analyzeTables } from "./analyze-tables.js";
export type { DbUrls } from "./global-setup.js";
export { createTestOrganization } from "./helpers.js";
export { createIsolatedDatabase, type IsolatedDatabase } from "./isolated-database.js";
