// The journeys (spec 12.1, gate 6), in Chromium on a phone and on a desktop, against the real api and Postgres that
// test/e2e/global-setup.ts starts. Run them with `pnpm --filter @travel-crm/web e2e`; Docker must be running.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./test/e2e/global-setup.ts",
  // Playwright empties this folder as a run starts: a folder of the journeys' own, so the visual audit's shots
  // (test-results/audit) outlive a journey run (test/playwright-output.test.ts).
  outputDir: "test-results/journeys",
  // Building the app and starting Postgres takes a while; each journey itself is quick.
  globalTimeout: 10 * 60_000,
  timeout: 30_000,
  workers: 2,
  // A test.only left in by mistake fails CI; locally it focuses a run.
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
