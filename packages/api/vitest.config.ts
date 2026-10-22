// Tests for the tRPC layer. Most are unit tests on stand-in services; the website form's and the consent card's routers run
// on the real database the db package's test setup starts (provides inject("dbUrls")). The rest of the routers are tested
// end to end through the HTTP app in apps/api.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
