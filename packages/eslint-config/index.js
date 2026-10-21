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

// Matches a tagged $queryRaw/$executeRaw that reads or writes one of the given tables: after JOIN, UPDATE or INTO, or
// anywhere in the comma-separated table list after FROM or USING (each earlier entry a table, maybe with an alias),
// quoted or not, optionally in "public". Column names such as organization_id never match: the table name must end
// there. OrgTx hides these tables' models, but not the raw-SQL methods, and the tables have no row-level security, so
// raw SQL is the remaining way in.
const tableReference = '("?public"?\\.)?"?\\w+"?(\\s+(as\\s+)?\\w+)?';
function rawSqlNaming(tables) {
  return (
    "TaggedTemplateExpression[tag.property.name=/^\\$(queryRaw|executeRaw)$/] " +
    `TemplateElement[value.raw=/\\b((from|using)\\s+(${tableReference}\\s*,\\s*)*|(join|update|into)\\s+)` +
    `("?public"?\\.)?"?(${tables.join("|")})"?\\b/i]`
  );
}

/**
 * The tables without row-level security, each of which only its own module may name in raw SQL. A module's ESLint
 * config allows its own with rawSqlSelectorsAllowing().
 */
const unscopedTableSelectors = {
  signInTables: {
    selector: rawSqlNaming([
      "user",
      "session",
      "account",
      "verification",
      "two_factor",
      "organization",
      "member",
      "invitation",
    ]),
    message: "Only the identity module queries the sign-in tables.",
  },
  webhookEvents: {
    selector: rawSqlNaming(["webhook_event"]),
    message: "Only the webhooks module queries webhook_event: it has no row-level security and holds raw payloads.",
  },
  rateLimitCounters: {
    selector: rawSqlNaming(["rate_limit_counter"]),
    message: "Only the rate-limits module queries rate_limit_counter: it has no row-level security.",
  },
  sheetsKeyCheck: {
    selector: rawSqlNaming(["sheets_key_check"]),
    message:
      "Only the api's sheets-key-check.ts reaches sheets_key_check, and through Prisma: it has no row-level security.",
  },
  sheetSchedule: {
    selector: rawSqlNaming(["sheet_check_schedule", "sheet_spreadsheet_claim"]),
    message:
      "Only the sheets module's schedule.ts queries sheet_check_schedule and sheet_spreadsheet_claim: they have no row-level security.",
  },
};

/** SQL that switches the organization or the session, in a template or a plain string. Every package but db keeps these. */
export const organizationSwitchSelectors = [
  { selector: `TemplateElement[value.raw=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
  { selector: `Literal[value=/${organizationSwitchPattern}/i]`, message: organizationSwitchMessage },
];

/**
 * The raw-SQL guard's no-restricted-syntax entries for a module that may name some tables without row-level security:
 * the organization-switch entries always, and every table entry but the allowed ones ("signInTables" for identity).
 * Flat config replaces rule options rather than merging them, so a module's override lists the whole rule this way.
 */
export function rawSqlSelectorsAllowing(...allowed) {
  for (const name of allowed) {
    if (!(name in unscopedTableSelectors)) throw new RangeError(`No raw-SQL table entry named ${JSON.stringify(name)}`);
  }
  const tables = Object.entries(unscopedTableSelectors).filter(([name]) => !allowed.includes(name));
  return [...organizationSwitchSelectors, ...tables.map(([, entry]) => entry)];
}

/**
 * A tripwire against accidental use, not a security boundary: it flags SQL text that would switch the organization
 * inside db.forOrg(), raw SQL naming a table without row-level security outside its own module (the sign-in tables,
 * webhook_event, rate_limit_counter), and Prisma's *Unsafe raw methods, which take SQL as a plain string. It cannot see
 * SQL built at runtime; Postgres row-level security is the real boundary. packages/db implements forOrg() and turns
 * these rules off; the identity, webhooks and rate-limits modules and the sheets module's schedule each allow their own tables
 * (rawSqlSelectorsAllowing).
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
    "no-restricted-syntax": ["error", ...rawSqlSelectorsAllowing()],
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
