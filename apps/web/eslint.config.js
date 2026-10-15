// ESLint for @travel-crm/web: the shared strict config, plus Next.js's and React's hook rules.
import nextPlugin from "@next/eslint-plugin-next";
import { base } from "@travel-crm/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname, ignores: [".next/**", "next-env.d.ts", "public/**"] }),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
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
