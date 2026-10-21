// Connecting a Google Sheet (spec 6.5, 12.1): an Owner shares the sheet, pastes its link, matches the columns as guessed
// and chooses "only new rows"; the form then adds a row, and within one check the lead shows with the source Google
// Sheet, its owner (from the sheet's Handled by column) and that owner's notice.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { anotherPersonsDevice, leadWorkerAgency } from "./support/leads";
import {
  aGoogleForm,
  answer,
  connectSheet,
  fakeGoogle,
  FORM_HEADER,
  FORM_TAB,
  syncNow,
  waitForLead,
} from "./support/sheets";

test("an Owner connects a sheet; a new row becomes a lead with its source, owner and notice", async ({
  page,
  browser,
  agency,
  addStaff,
}) => {
  test.setTimeout(240_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const form = await aGoogleForm(google, {
    header: [...FORM_HEADER, "Handled by"],
    rows: [answer("Priya Nair", "98450 12345", ["Asha Sharma"])],
  });

  // The first step names the address to share with, and the instruction.
  await page.goto("/settings/lead-sources/sheets/connect");
  await expect(page.getByRole("textbox", { name: "Our address" })).toHaveValue(await google.accountEmail());
  await expect(page.getByText("In your sheet press Share, paste the address and choose Viewer.")).toBeVisible();
  await expectAccessible(page);

  await connectSheet(page, { link: form.link, existing: "only_new" });
  await expect(page.getByRole("heading", { level: 1, name: form.title })).toBeVisible();
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
  await expectAccessible(page);

  // The row already there is not added; the one the form adds now is.
  await google.append(form.id, FORM_TAB, answer("Rahul Sharma", "98200 98200", ["Ravi Kumar"]));
  await syncNow(page);
  await waitForLead(page, "Rahul Sharma");
  await expect(page.getByRole("main").getByText("Priya Nair")).toHaveCount(0);
  await page
    .getByRole("main")
    .getByRole("link", { name: /Rahul Sharma/ })
    .first()
    .click();
  const ownerCard = page.getByRole("region", { name: "Owner and source" });
  await expect(ownerCard.getByText("Ravi Kumar", { exact: true })).toBeVisible();
  await expect(ownerCard.getByText("Google Sheet")).toBeVisible();

  // The sheet's page counts it, and Ravi is told.
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("link", { name: form.title })).toBeVisible();
  const ravisPhone = await anotherPersonsDevice(browser);
  const ravisPage = await ravisPhone.newPage();
  await signInByCode(ravisPage, { code: agency.code, staff: ravi });
  await ravisPage.goto("/dashboard");
  await ravisPage
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  await expect(
    ravisPage.getByRole("dialog", { name: "Notifications" }).getByText("New lead assigned to you"),
  ).toBeVisible();
  await ravisPhone.close();
});
