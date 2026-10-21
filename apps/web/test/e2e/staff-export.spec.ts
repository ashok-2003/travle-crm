// Spec 12.1's journey 8, staff export (bulk plan, Task 3.8): the Owner prepares the staff list from Staff and downloads
// it, a real workbook with the people, their roles and their phones.
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { readFile } from "node:fs/promises";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

test("export the staff list", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await addStaff({ name: "Meera Iyer", username: "meera", roleKey: "operations" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await expect(page.getByText("Ravi Kumar")).toBeVisible();
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export staff" });
  await expect(dialog.getByText("3 people, with their roles and joined dates.")).toBeVisible();
  await expect(dialog.getByText("Your staff")).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Prepare the file" }).click();
  await expect(dialog.getByText(/^staff-\d{4}-\d{2}-\d{2}\.xlsx$/)).toBeVisible({ timeout: 60_000 });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^staff-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const sheet = await createSpreadsheets().read(new Uint8Array(await readFile(await file.path())), {
    kind: "xlsx",
    maxRows: 100,
    maxColumns: 20,
    maxCellLength: 4000,
  });
  expect(sheet.header).toEqual(["Name", "Username", "Email", "Phone", "Role", "Joined", "Status", "Last active"]);
  expect(sheet.rows.map((row) => [row.cells[0], row.cells[1], row.cells[4]])).toEqual([
    ["Asha Sharma", null, "Owner"],
    ["Ravi Kumar", "ravi", "Sales"],
    ["Meera Iyer", "meera", "Operations"],
  ]);
});
