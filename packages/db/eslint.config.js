// ESLint for @travel-crm/db: the shared strict config. This package implements db.forOrg(), so it alone may write the
// SQL that sets the organization and use Prisma's raw-string methods (see rawDatabaseAccessGuard).
import { base } from "@travel-crm/eslint-config";
import { defineConfig } from "eslint/config";

export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  rules: { "no-restricted-properties": "off", "no-restricted-syntax": "off" },
});
