// Shared ESLint flat config: strict, type-aware TypeScript rules for every package.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const organizationSwitchMessage =
  "Only packages/db may set the organization (set_config / app.org_id). Inside db.forOrg() the organization is " +
  "fixed for the whole transaction; changing it would expose another organization's rows.";

/**
 * Blocks the two ways code outside packages/db could get round db.forOrg(): SQL that changes the organization setting,
 * and Prisma's *Unsafe raw methods, which take SQL as a plain string instead of parameters.
 * packages/db implements forOrg() and turns these rules off in its own config.
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
      { selector: "TemplateElement[value.raw=/set_config|app\\.org_id/i]", message: organizationSwitchMessage },
      { selector: "Literal[value=/set_config|app\\.org_id/i]", message: organizationSwitchMessage },
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
