// The at-scale and query-plan tests (test/performance): a large seeded agency, budgets, plans. They run nightly and on
// demand (ci.yml's performance job), never on a pull request, because a shared runner's speed is not a regression.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "domain-performance",
    include: ["test/performance/**/*.test.ts"],
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
