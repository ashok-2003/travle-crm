// The same file again (spec B6, B33, 12.1): the columns' step says it was imported before, the preview leaves its rows
// out as Already imported and adds nothing unless the importer chooses.
import { expect, signInByEmail, test } from "./support/fixtures";
import {
  addAndWait,
  checkTheRows,
  countOf,
  csvFile,
  importAsGuessed,
  startLeadImport,
} from "./support/lead-import-steps";

test("the same file again: Already imported, nothing added unless chosen", async ({ page, agency }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const rows = [
    ["Name", "Phone", "Destination"],
    ["Anita Verma", "98765 10001", "Goa"],
    ["Imran Shaikh", "98765 10002", "Kashmir"],
    ["Meera Nair", "98765 10003", "Kerala"],
  ];
  await importAsGuessed(page, csvFile("enquiries-oct-2026.csv", rows));
  await expect(countOf(page, "New leads")).toContainText("3");

  await startLeadImport(page, csvFile("enquiries-oct-2026.csv", rows));
  await expect(page.getByText(/You imported this file on .* \(3 leads added\)/)).toBeVisible();
  await checkTheRows(page).catch(async () => {
    // Nothing is left to add, so the preview's Add reads "Add 0 rows".
    await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible();
  });
  const again = page.getByRole("checkbox", { name: "Add the 3 rows already imported again" });
  await expect(again).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Add 0 rows" })).toBeDisabled();
  await again.click();
  await expect(again).toBeChecked();
  await expect(page.getByRole("button", { name: "Add 3 rows" })).toBeEnabled();
  // Ticked, they are added as repeat enquiries on the open leads they made.
  await addAndWait(page);
  await expect(countOf(page, "New leads")).toContainText("0");
  await expect(countOf(page, "Repeat enquiries")).toContainText("3");
});
