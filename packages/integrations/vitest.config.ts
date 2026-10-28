// Adapter tests: the jobs adapter runs against the throwaway Postgres that @travel-crm/db's test setup starts;
// the storage and email adapters start their own containers (MinIO, Mailpit) in their test files.
//
// The pg-boss files share one job table in that database, and the administration test lists every failed job in it, so
// a failed job another file leaves there (the malformed one) would be reported in the middle of its run. Those files run
// one after another; every other file runs as before, in parallel.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const pgBossFiles = "test/jobs/pg-boss-*.test.ts";
const shared = {
  // Provides inject("dbUrls") to the tests.
  globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
  testTimeout: 30_000,
  hookTimeout: 120_000,
};

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { ...shared, name: "integrations", include: ["test/**/*.test.{ts,tsx}"], exclude: [pgBossFiles] },
      },
      {
        extends: true,
        test: { ...shared, name: "integrations-pg-boss", include: [pgBossFiles], fileParallelism: false },
      },
    ],
  },
});
