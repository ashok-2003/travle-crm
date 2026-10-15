// Adapter tests: the jobs adapter runs against the throwaway Postgres that @travel-crm/db's test setup starts;
// the storage and email adapters start their own containers (MinIO, Mailpit) in their test files.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "integrations",
    include: ["test/**/*.test.{ts,tsx}"],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
