// A sheet's controls (spec 6.5, S41, S42): Sync now twice in a row is refused with its sentence; Pause and Resume; Disconnect
// asks and drops the sheet; connecting it again asks about its rows again and adds nothing twice.
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_TAB, syncNow, waitForLead } from "./support/sheets";

test("Sync now twice is refused; Pause and Resume; Disconnect; connecting again adds nothing twice", async ({
  page,
  agency,
}) => {
  test.setTimeout(240_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")] });
  await connectSheet(page, { link: form.link, existing: "only_new" });
  await google.append(form.id, FORM_TAB, answer("Rahul Sharma", "98200 98200"));
  await syncNow(page);
  // Pressed again at once, it is refused with its sentence.
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Just checked. Try again in a few seconds.")).toBeVisible();
  const sheetPage = page.url();
  await waitForLead(page, "Rahul Sharma");
  await page.goto(sheetPage);

  const menu = page.getByRole("button", { name: "More actions for this sheet" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(page.getByText("This sheet is paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Running", { exact: true })).toBeVisible();

  await menu.click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page).toHaveURL(/\/settings\/lead-sources$/);
  await expect(page.getByRole("link", { name: form.title })).toHaveCount(0);

  // Connected again, it asks about its rows once more; "only new" adds nothing, and the lead is not made twice.
  await connectSheet(page, { link: form.link, existing: "only_new" });
  await page.goto("/leads?view=everyone&source=google_sheet");
  await expect(page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ })).toHaveCount(1);
});
