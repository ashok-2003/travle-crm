// Shared ESLint flat config: strict, type-aware TypeScript rules for every package.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Matches SQL that changes the organization setting or the session around it: set_config / app.org_id (whitespace
// allowed around the dot), SET [LOCAL|SESSION] ROLE, SET SESSION AUTHORIZATION, RESET ALL / RESET ROLE, CREATE TEMP[ORARY].
const organizationSwitchPattern =
  "set_config|app\\s*\\.\\s*org_id|\\bset\\s+(local\\s+|session\\s+)?(role|session\\s+authorization)\\b|" +
  "\\breset\\s+(all|role)\\b|\\bcreate\\s+temp(orary)?\\b";

const organizationSwitchMessage =
  "Only packages/db may change the organization or database session state (set_config, app.org_id, SET ROLE, RESET, " +
  "CREATE TEMP). Inside db.forOrg() the organization is meant to stay fixed for the transaction.";

/**
 * A tripwire against accidental use, not a security boundary: it flags SQL text that would switch the organization
 * inside db.forOrg() and Prisma's *Unsafe raw methods, which take SQL as a plain string. It cannot see SQL built at
 * runtime; Postgres row-level security is the real boundary. packages/db implements forOrg() and turns these rules off.
 *
 * A package must not redefine no-restricted-syntax or no-restricted-properties without re-including these entries:
 * flat config replaces rule options rather than merging them, so a redefinition silently drops the guard.
 */
export const rawDatabaseAccessGuard = {
  rules: {
    "no-restricted-properties": [
      "error",
      { property: "$executeRawUnsafe", message: "Use the $executeRaw tagged template: it sends values as parameters." },
      { property: "$queryRawUnsafe", message: "Use the $queryRaw tagged template: it sends values as parameters." },
    ],
    "no-restricted-syntax": [
      "error",
      { selector: `TemplateElement[value.raw=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
      { selector: `Literal[value=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
    ],
  },
};

/**
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function base({ tsconfigRootDir, ignores = [] }) {
  return defineConfig(
    globalIgnores(["**/dist/**", "**/.turbo/**", "**/generated/**", "**/coverage/**", "**/.vitest/**", ...ignores]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      rules: {
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-floating-promises": "error",
      },
    },
    rawDatabaseAccessGuard,
    { files: ["**/*.js", "**/*.mjs", "**/*.cjs"], extends: [tseslint.configs.disableTypeChecked] },
  );
}
