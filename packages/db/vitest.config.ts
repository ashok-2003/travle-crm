// Tests run against a real Postgres started once per run by test/global-setup.ts.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
