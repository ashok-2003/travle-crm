// ESLint for @travel-crm/web: the shared strict config, plus Next.js's and React's hook rules.
import nextPlugin from "@next/eslint-plugin-next";
import { base } from "@travel-crm/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  base({
    tsconfigRootDir: import.meta.dirname,
    // Build output, served files, and Playwright's results (written while lint may be running).
    ignores: [".next/**", "next-env.d.ts", "public/**", "test-results/**", "playwright-report/**"],
  }),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
  // Playwright fixtures take an empty pattern and call `use`, which isn't React's hook.
  {
    files: ["test/e2e/**"],
    rules: { "no-empty-pattern": "off", "react-hooks/rules-of-hooks": "off" },
  },
  // The Turbopack loader and dependency-cruiser's alias file are CommonJS, which the tools that load them need.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
