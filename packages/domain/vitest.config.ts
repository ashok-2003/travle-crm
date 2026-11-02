// Domain tests: business rules, and the identity module against the throwaway Postgres that @travel-crm/db's
// test setup starts (same roles and migrations as the db package's own tests).
import { createRequire } from "node:module";
import { configDefaults, defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "domain",
    include: ["test/**/*.test.ts"],
    // The at-scale and plan tests run apart, nightly (vitest.performance.config.ts): they are not a merge gate.
    exclude: [...configDefaults.exclude, "test/performance/**"],
    setupFiles: [require.resolve("@travel-crm/db/testing/transaction-limits")],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
