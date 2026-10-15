// ESLint for @travel-crm/domain: the shared strict config. Three modules may write raw SQL naming a table without
// row-level security, each only its own: identity the sign-in tables, webhooks webhook_event, rate-limits
// rate_limit_counter. Their folders keep the rest of the raw-database guard.
import { base, rawSqlSelectorsAllowing } from "@travel-crm/eslint-config";
import { defineConfig } from "eslint/config";

/** The raw-SQL guard for one module's source and tests, allowing that module's own tables. */
const allowingInModule = (module, ...tables) => ({
  files: [`src/${module}/**`, `test/${module}/**`],
  // Flat config replaces rule options rather than merging them, so this list is the whole rule for these files.
  rules: { "no-restricted-syntax": ["error", ...rawSqlSelectorsAllowing(...tables)] },
});

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname }),
  allowingInModule("identity", "signInTables"),
  allowingInModule("webhooks", "webhookEvents"),
  allowingInModule("rate-limits", "rateLimitCounters"),
);
