// End-to-end tests through the HTTP app (app.request), against the throwaway Postgres that @travel-crm/db's test
// setup starts.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "api-server",
    include: ["test/**/*.test.ts"],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
