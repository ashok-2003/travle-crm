// Spec 12.1's journey 9 for staff (bulk plan, Task 3.8): an agency the lifecycle made read-only can't import (the button
// is off with its reason) but can still export its staff list.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { setSubscriptionState } from "./support/subscription-states";

test("a read-only agency: Import is off with its hint, and Export still works", async ({ page, agency, database }) => {
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  const importButton = page.getByRole("button", { name: "Import" });
  await expect(importButton).toBeDisabled();
  await expect(importButton).toHaveAccessibleDescription(
    "Your organization is read-only until its payment is made. You can still view and export.",
  );
  await expect(page.getByRole("link", { name: "Import" })).toHaveCount(0);
  await animationsSettled(page);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export staff" });
  await dialog.getByRole("button", { name: "Prepare the file" }).click();
  await expect(dialog.getByText(/^staff-\d{4}-\d{2}-\d{2}\.xlsx$/)).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/^staff-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
