// Journey 9 (spec 12), the export's half: a read-only agency still exports its leads, as an export is something every
// state but cancelled may do (ADR 0021), while it can add none.
import { readFile } from "node:fs/promises";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { setSubscriptionState } from "./support/subscription-states";

test("a read-only agency still exports its leads", async ({ page, agency, database }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");

  await page.goto("/leads");
  await expect(page.getByText("Read-only until paid: you can view and export")).toBeVisible();
  await expect(page.getByRole("link", { name: "New lead" })).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export leads" });
  const prepare = dialog.getByRole("button", { name: "Prepare the file" });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const download = dialog.getByRole("button", { name: "Download" });
  await expect(download).toBeEnabled({ timeout: 60_000 });
  const started = page.waitForEvent("download");
  await download.click();
  const file = await started;
  expect(file.suggestedFilename()).toMatch(/^leads-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
  // An .xlsx is a zip: it starts "PK".
  expect((await readFile(await file.path())).subarray(0, 2).toString("latin1")).toBe("PK");
});
