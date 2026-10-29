// Rows a sheet can't add (spec 6.5, S27, S31): a row with no contact is listed with its reason; the sheet's cell is
// fixed and the next check adds the lead and clears the line; another is hidden by hand.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_TAB, syncNow, waitForLead } from "./support/sheets";

test("a row with no contact is listed with its reason; fixing the cell adds the lead and clears the line; Hide removes another", async ({
  page,
  agency,
}) => {
  test.setTimeout(240_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")] });
  await connectSheet(page, { link: form.link, existing: "only_new" });
  const sheetPage = page.url();

  await google.append(form.id, FORM_TAB, answer("Aditi Rao", ""));
  await google.append(form.id, FORM_TAB, answer("Suresh Menon", ""));
  await syncNow(page);
  const problems = page.getByRole("region", { name: "Couldn't be added" });
  await expect(problems.getByText("Aditi Rao")).toBeVisible();
  await expect(problems.getByText("Suresh Menon")).toBeVisible();
  await expect(problems.getByText("No phone, email or Instagram we can use").first()).toBeVisible();
  await expect(page.getByText("Fix the row in your sheet:")).toBeVisible();
  await expectAccessible(page);

  // Row 3 is Aditi's: the form's owner fixes the cell.
  await google.editCell(form.id, FORM_TAB, 3, 2, "98111 22233");
  await page.getByRole("button", { name: "Hide row 4" }).click();
  await expect(problems.getByText("Suresh Menon")).toHaveCount(0);
  await page.waitForTimeout(31_000);
  await syncNow(page);
  await waitForLead(page, "Aditi Rao");
  // The line clears when the worker's check has run past the fixed row: reload until it has, not once.
  await expect(async () => {
    await page.goto(sheetPage);
    await expect(page.getByRole("region", { name: "Couldn't be added" })).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
});
