// Shared ESLint flat config: strict, type-aware TypeScript rules for every package.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Matches SQL that changes the organization setting or the session around it: set_config / app.org_id (whitespace
// allowed around the dot), SET [LOCAL|SESSION] ROLE (not "SET role = x", a column assignment), SET SESSION AUTHORIZATION, RESET ALL / RESET ROLE, CREATE TEMP[ORARY].
const organizationSwitchPattern =
  "set_config|app\\s*\\.\\s*org_id|\\bset\\s+(local\\s+|session\\s+)?(role\\b(?!\\s*=)|session\\s+authorization\\b)|" +
  "\\breset\\s+(all|role)\\b|\\bcreate\\s+temp(orary)?\\b";

const organizationSwitchMessage =
  "Only packages/db may change the organization or database session state (set_config, app.org_id, SET ROLE, RESET, " +
  "CREATE TEMP). Inside db.forOrg() the organization is meant to stay fixed for the transaction. This rule is a " +
  "tripwire against accidental use; Postgres row-level security is the real boundary.";

// Matches a tagged $queryRaw/$executeRaw that reads or writes one of Better Auth's sign-in tables: after JOIN, UPDATE
// or INTO, or anywhere in the comma-separated table list after FROM or USING (each earlier entry a table, maybe with an
// alias), quoted or not, optionally in "public". Column names such as organization_id never match: the table name must
// end there. OrgTx hides those models, but not the raw-SQL methods, and the tables have no row-level security, so raw
// SQL is the remaining way in.
const tableReference = '("?public"?\\.)?"?\\w+"?(\\s+(as\\s+)?\\w+)?';
const signInTableSelector =
  "TaggedTemplateExpression[tag.property.name=/^\\$(queryRaw|executeRaw)$/] " +
  `TemplateElement[value.raw=/\\b((from|using)\\s+(${tableReference}\\s*,\\s*)*|(join|update|into)\\s+)` +
  '("?public"?\\.)?"?(user|session|account|verification|two_factor|organization|member|invitation)"?\\b/i]';

/** SQL that switches the organization or the session, in a template or a plain string. Every package but db keeps these. */
export const organizationSwitchSelectors = [
  { selector: `TemplateElement[value.raw=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
  { selector: `Literal[value=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
];

/**
 * A tripwire against accidental use, not a security boundary: it flags SQL text that would switch the organization
 * inside db.forOrg(), raw SQL naming a sign-in table, and Prisma's *Unsafe raw methods, which take SQL as a plain
 * string. It cannot see SQL built at runtime; Postgres row-level security is the real boundary. packages/db implements
 * forOrg() and turns these rules off; the identity module keeps only organizationSwitchSelectors.
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
      ...organizationSwitchSelectors,
      { selector: signInTableSelector, message: "Only the identity module queries the sign-in tables." },
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
