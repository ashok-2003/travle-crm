// A lead import with every problem a file can have (spec 3.2, B24, B34, B35, 12.1): an .xlsx whose preview groups what
// will be added, what is the importer's choice and what won't be added with its examples; the rows not added come back
// as a file with a column saying why, which is fixed and imported again, adding only the fixed rows.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { xlsxOf } from "./support/imports";
import { addAndWait, checkTheRows, countOf, csvFile, readDownload, startLeadImport } from "./support/lead-import-steps";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";

test("an .xlsx with every problem: each group in the preview; the rows not added, fixed and imported again, add only those", async ({
  page,
  agency,
}) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  // A customer with an open lead, and one whose number is blocked.
  await addLeadThroughApi(page, leadInput({ person: { name: "Open Customer", phone: "+919876500008" } }));
  const blocked = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Karan Blocked", phone: "+919876500007" } }),
  );
  await callApi(page, "leads.block", { leadId: blocked });

  const header = ["Name", "Phone", "Email", "Destination", "Travel date", "Status"];
  const workbook = await xlsxOf([
    header,
    ["Anita Verma", "98765 00002", "anita@example.com", "Goa", "16/12/2026", "New"],
    ["Imran Shaikh", "98765 00003", "", "Kashmir", "next winter", "Called"],
    ["", "98765 00004", "", "Goa", "", ""],
    ["Meera Nair", "", "", "Kerala", "", ""],
    ["Test Entry", "98765 00006", "", "", "", "Junk"],
    ["Karan Blocked", "98765 00007", "", "Manali", "", ""],
    ["Open Customer", "98765 00008", "", "Goa", "", ""],
    ["Anita Verma", "98765 00002", "anita@example.com", "Goa", "16/12/2026", "New"],
  ]);
  await startLeadImport(page, {
    name: "enquiries-oct-2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await checkTheRows(page);

  const added = page.getByRole("heading", { name: "Will be added" }).locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(added).toContainText("New leads");
  await expect(added.getByRole("listitem").filter({ hasText: "New leads" })).toContainText("2");
  await expect(added.getByRole("listitem").filter({ hasText: "Repeat enquiries on open leads" })).toContainText("1");
  await expect(added.getByRole("listitem").filter({ hasText: "With a value kept in the note" })).toContainText("1");
  await expect(page.getByRole("checkbox", { name: "Add the 1 row from a blocked contact anyway" })).not.toBeChecked();
  await expect(page.getByRole("heading", { name: /^Won't be added/ })).toContainText("4");
  await page.getByRole("button", { name: /^No name/ }).click();
  await expect(page.getByText("Row 4")).toBeVisible();
  await expect(page.getByText("Same as row 2")).toHaveCount(0);
  await page.getByRole("button", { name: /^Same as an earlier row/ }).click();
  await expect(page.getByText("Row 9 · Anita Verma")).toBeVisible();
  await expect(
    page.getByText("Goa and Kashmir").or(page.getByText(/will be added to your destinations/)),
  ).toBeVisible();
  await expectAccessible(page);

  await addAndWait(page);
  await expect(countOf(page, "New leads")).toContainText("2");
  await expect(countOf(page, "Repeat enquiries")).toContainText("1");
  await expect(countOf(page, "Rows not added")).toContainText("5");
  await expect(page.getByText("5 rows weren't added")).toBeVisible();
  await expect(page.getByText(/kept until/)).toBeVisible();
  await expectAccessible(page);

  // The report has the file's own columns after two of ours, and says why each row wasn't added.
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the 5 rows not added" }).click();
  const report = await readDownload(await downloading);
  expect(report.header).toEqual(["Why it wasn't added", "Row", ...header]);
  expect(report.rows.map((row) => [row.cells[0], row.cells[1]])).toEqual([
    ["No name", "4"],
    ["No phone, email or Instagram", "5"],
    ["Marked Not a lead", "6"],
    ["A blocked contact", "7"],
    ["Same as row 2", "9"],
  ]);

  // Fixed in Excel, and imported as it is: the two first columns are matched to Don't import by themselves, and what
  // was added before is left out.
  const fixed = csvFile("enquiries-oct-2026 - rows not added.csv", [
    ["Why it wasn't added", "Row", ...header],
    ["No name", "4", "Pooja Rao", "98765 00004", "", "Goa", "", ""],
    ["No phone, email or Instagram", "5", "Meera Nair", "98765 00005", "", "Kerala", "", ""],
    ["Marked Not a lead", "6", "Test Entry", "98765 00006", "", "", "", "New"],
    ["Anita Verma again", "2", "Anita Verma", "98765 00002", "anita@example.com", "Goa", "16/12/2026", "New"],
  ]);
  await startLeadImport(page, fixed);
  await expect(page.getByRole("combobox", { name: "What Why it wasn't added holds" })).toHaveText("Don't import");
  await expect(page.getByRole("combobox", { name: "What Row holds" })).toHaveText("Don't import");
  await checkTheRows(page);
  await expect(page.getByRole("button", { name: "Add 3 rows" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Add the 1 row already imported again" })).not.toBeChecked();
  await addAndWait(page);
  await expect(countOf(page, "New leads")).toContainText("3");
});
