// Lost access (spec 6.5, S39): the sheet is unshared and a person presses Sync now; the page says Lost access with the
// address, since when and Check again, and the Owner has exactly one notice. Shared again and checked, it runs, and the
// rows that arrived meanwhile are added.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_TAB, syncNow, waitForLead } from "./support/sheets";

test("unshare a sheet: Lost access with the address and one notice; share again and check: the waiting rows are added", async ({
  page,
  agency,
}) => {
  test.setTimeout(240_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")] });
  await connectSheet(page, { link: form.link, existing: "only_new" });

  await google.unshare(form.id);
  await google.append(form.id, FORM_TAB, answer("Rahul Sharma", "98200 98200"));
  await page.waitForTimeout(31_000);
  await page.getByRole("button", { name: "Sync now" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "We can't open this sheet any more" });
  await expect(alert).toBeVisible({ timeout: 60_000 });
  await expect(alert.getByRole("textbox", { name: "Our address" })).toHaveValue(await google.accountEmail());
  await expect(page.getByText("Lost access", { exact: true })).toBeVisible();
  await expectAccessible(page);

  // One notice to the Owner, however often it is looked at.
  await expect(async () => {
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Notifications/ })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Notifications" }).getByText(/We can't open your sheet/)).toHaveCount(
      1,
      { timeout: 3_000 },
    );
  }).toPass({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  await google.share(form.id);
  await page.goBack();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 60_000 });
  await syncNow(page).catch(() => undefined);
  await waitForLead(page, "Rahul Sharma");
});
