// The lead import's other states pass axe too (spec 12.1): choosing a file, a file on its way to storage with Stop, and
// a file we can't read, each as a person meets it.
import type { Route } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { chooseImportFile } from "./support/imports";
import { csvFile, WORKER_STEP_MS } from "./support/lead-import-steps";

test("choosing a file, a file on its way, and a file we can't read are accessible", async ({ page, agency }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  await page.goto("/leads/import");
  await expect(page.getByRole("heading", { level: 1, name: "Import leads" })).toBeVisible();
  await expect(page.getByText("Step 1 of 4 · Choose a file")).toBeVisible();
  await expectAccessible(page);

  // The upload to storage is held, so the screen shows its progress and Stop.
  const baseUrl = new URL(page.url()).origin;
  const away = (url: URL) => url.origin !== baseUrl;
  const hold = (route: Route) => {
    if (route.request().method() !== "PUT") return route.continue();
    return new Promise<void>(() => undefined);
  };
  await page.route(away, hold);
  await chooseImportFile(
    page,
    csvFile("enquiries-oct-2026.csv", [
      ["Name", "Phone"],
      ["Asha", "98765 43210"],
    ]),
  );
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.unroute(away, hold);

  await chooseImportFile(page, {
    name: "notes.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("these are notes, not a workbook"),
  });
  await expect(page.getByText("We can't read notes.xlsx")).toBeVisible({ timeout: WORKER_STEP_MS });
  await expectAccessible(page);
});
