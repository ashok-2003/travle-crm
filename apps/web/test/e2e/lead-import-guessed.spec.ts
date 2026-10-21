// A lead import from a file the product guesses well (spec 3.2, 12.1): a CSV of 20 leads with an Owner column. Choose,
// check and add without changing a column; every lead is added with the source Import, each to its owner, and each
// owner other than the importer is told once ("10 leads from an import are now yours").
import { expectAccessible } from "./support/accessibility";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { addAndWait, checkTheRows, countOf, csvFile, startLeadImport } from "./support/lead-import-steps";
import { anotherPersonsDevice, leadWorkerAgency } from "./support/leads";

test("a CSV of 20 leads with guessed columns and an Owner column: added with source Import, each owner told once", async ({
  page,
  browser,
  agency,
  addStaff,
}) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const rows = [["Name", "Mobile No", "Destination", "Assigned To"]];
  for (let index = 0; index < 20; index += 1) {
    rows.push([
      `Customer ${String(index + 1)}`,
      `98100000${String(index).padStart(2, "0")}`,
      index % 2 === 0 ? "Goa" : "Kerala",
      index % 2 === 0 ? "Asha Sharma" : "Ravi Kumar",
    ]);
  }

  await page.goto("/leads");
  await page.getByRole("main").getByRole("link", { name: "Import" }).click();
  await expect(page).toHaveURL(/\/leads\/import$/);
  await startLeadImport(page, csvFile("enquiries-oct-2026.csv", rows));
  await expect(page.getByRole("combobox", { name: "What Mobile No holds" })).toHaveText("Phone");
  await expect(page.getByRole("combobox", { name: "What Assigned To holds" })).toHaveText("Owner");
  await expectAccessible(page);
  await checkTheRows(page);
  await expect(countOf(page, "New leads")).toContainText("20");
  await expectAccessible(page);
  await addAndWait(page);
  await expect(countOf(page, "New leads")).toContainText("20");
  await expect(countOf(page, "Rows not added")).toContainText("0");

  await page.getByRole("link", { name: "See the imported leads" }).click();
  await expect(page).toHaveURL(/\/leads\?view=everyone&source=bulk_upload/);
  // Everyone's leads: Ravi's are in it beside the Owner's.
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /Customer 2\b/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /Customer 1\b/ })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Customer 1\b/ })
    .first()
    .click();
  await expect(page.getByText("Lead added from an import").first()).toBeVisible();

  // Ravi owns ten of them and is told once, not ten times.
  const phone = await anotherPersonsDevice(browser);
  const ravisPage = await phone.newPage();
  await signInByCode(ravisPage, { code: agency.code, staff: ravi });
  await ravisPage.goto("/dashboard");
  await ravisPage
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  const panel = ravisPage.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("10 leads from an import are now yours")).toHaveCount(1);
  await phone.close();
});
