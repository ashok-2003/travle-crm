// The visual audit: a full-page screenshot of every screen on a phone and a desktop, against the same real api,
// worker, console and Postgres the journeys start (test/e2e/global-setup.ts), one screen after another. Only
// test/e2e/audit/*.audit.ts runs, never a journey; the shots go to AUDIT_OUT (test-results/audit by default), listed
// in its index.md. Run it with `pnpm e2e:audit`; Docker must be running.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e/audit",
  testMatch: "**/*.audit.ts",
  globalSetup: "./test/e2e/global-setup.ts",
  globalTeardown: "./test/e2e/audit/write-index.ts",
  // Playwright empties its output folder at the start of a run: not the one the shots go to.
  outputDir: "test-results/audit-run",
  // Building the app takes a while, and each test walks through many screens.
  globalTimeout: 30 * 60_000,
  timeout: 5 * 60_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
