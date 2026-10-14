// ESLint for @travel-crm/domain: the shared strict config. The identity module alone may write raw SQL that names the
// sign-in tables, so its folders keep only the organization-switch part of the raw-database guard.
import { base, organizationSwitchSelectors } from "@travel-crm/eslint-config";
import { defineConfig } from "eslint/config";

export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  files: ["src/identity/**", "test/identity/**"],
  // Flat config replaces rule options rather than merging them, so this list is the whole rule for these files.
  rules: { "no-restricted-syntax": ["error", ...organizationSwitchSelectors] },
});
