// A read-only agency (spec 6.5, ADR 0021, S44): the sheets wait with their sentence, Sync now and Connect are off with the
// hint, and Pause and Disconnect still work.
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, connectSheet, fakeGoogle } from "./support/sheets";
import { setSubscriptionState } from "./support/subscription-states";

const HINT = "Your organization is read-only until its payment is made. You can still view and export.";

test("a read-only agency: Sync now and Connect are off with the hint; Pause and Disconnect still work", async ({
  page,
  agency,
  database,
}) => {
  test.slow();
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")] });
  await connectSheet(page, { link: form.link, existing: "only_new" });
  const sheetPage = page.url();

  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await page.goto(sheetPage);
  await expect(page.getByText("Paused while your subscription is read-only")).toBeVisible();
  const sync = page.getByRole("button", { name: "Sync now" });
  await expect(sync).toBeDisabled();
  await expect(sync).toHaveAccessibleDescription(HINT);
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("button", { name: "Connect a sheet" })).toBeDisabled();

  await page.goto(sheetPage);
  await page.getByRole("button", { name: "More actions for this sheet" }).click();
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(page.getByText("This sheet is paused")).toBeVisible();
  await page.getByRole("button", { name: "More actions for this sheet" }).click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page).toHaveURL(/\/settings\/lead-sources$/);
});
