// Data protection (spec 5, ADR 0023): a super admin exports an agency, the console process runs the export's job, and
// the export downloads through its short-lived link; a purge waits until the agency is cancelled and has an export
// from the last day, then is queued with the agency's code typed, and the job's result shows. Each journey's agency is
// its own, so the purge deletes nothing another journey uses.
import { expect, test } from "./support/console";
import { consoleCall, openConsoleScreen } from "./support/console-platform";

const pageOf = (organizationId: string) => `/console/organizations/${organizationId}/data-protection`;

test("a super admin exports an agency and downloads the export", async ({ page, superAdmin, agency }) => {
  // The export is a job of the console process's, which takes its turn.
  test.slow();
  await openConsoleScreen(page, superAdmin, pageOf(agency.organizationId), "Data protection");
  await page.getByRole("button", { name: "Export everything" }).click();
  const ready = page.getByRole("main").getByRole("listitem").filter({ hasText: "Ready" });
  await expect(ready).toBeVisible({ timeout: 60_000 });
  await ready.getByRole("button", { name: "Download" }).click();
  const href = await ready.getByRole("link", { name: "Part 1" }).getAttribute("href");
  const part = await page.request.get(href ?? "");
  expect(part.ok()).toBe(true);
  // JSON lines: each of the organization's rows names its table.
  expect(await part.text()).toContain('"table"');
});

test("a purge waits for the agency to be cancelled and exported, then is queued with its code typed", async ({
  page,
  superAdmin,
  agency,
}) => {
  // Two jobs of the console process's, the export and the purge, each taking its turn.
  test.slow();
  await openConsoleScreen(page, superAdmin, pageOf(agency.organizationId), "Data protection");
  await expect(page.getByText("Cancel the organization's subscription first.")).toBeVisible();
  await expect(page.getByText(/Export the organization's data first/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete for good" })).toBeDisabled();

  // Support cancels an agency from its organization's page; the console's api does the same here.
  await consoleCall(page, "subscriptions.cancel", { organizationId: agency.organizationId, reason: "Closing down" });
  await page.getByRole("button", { name: "Export everything" }).click();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: "Ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.reload();
  await expect(page.getByText("Its subscription is cancelled")).toBeVisible();
  await expect(page.getByText("An export finished in the last day")).toBeVisible();

  await page.getByRole("button", { name: "Delete for good" }).click();
  const confirm = page.getByRole("alertdialog", { name: `Delete ${agency.name} for good?` });
  await confirm.getByLabel(`Type ${agency.code} to confirm`).fill(agency.code);
  await confirm.getByRole("button", { name: "Delete for good" }).click();
  await expect(page.getByText(/^Deleted for good: /)).toBeVisible({ timeout: 60_000 });
});
