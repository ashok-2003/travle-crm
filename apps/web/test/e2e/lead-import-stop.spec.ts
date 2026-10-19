// An import stopped halfway (spec 3.2 step 4, B28, B34, 12.1): the add of a big file is stopped from its progress
// screen; the rows already added stay, the batch under way finishes, and the report holds the rest as "Stopped before
// this row".
import { expect, signInByEmail, test } from "./support/fixtures";
import {
  checkTheRows,
  countOf,
  csvFile,
  readDownload,
  startLeadImport,
  WORKER_STEP_MS,
} from "./support/lead-import-steps";

const ROWS = 6000;

test("an import stopped halfway: the report holds the rest as Stopped before this row", async ({ page, agency }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const rows = [["Name", "Phone", "Destination"]];
  for (let index = 0; index < ROWS; index += 1) {
    rows.push([`Customer ${String(index)}`, `+9197${String(index).padStart(8, "0")}`, `Place ${String(index % 20)}`]);
  }
  await startLeadImport(page, csvFile("big-enquiries.csv", rows));
  await checkTheRows(page);
  await page.getByRole("button", { name: "Add 6,000 rows" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Add the rows" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Adding leads" })).toBeVisible({ timeout: WORKER_STEP_MS });
  // Some rows are added before Stop is pressed, and most are not.
  await expect(page.getByText(/^[1-9][\d,]* of 6,000 rows$/)).toBeVisible({ timeout: WORKER_STEP_MS });
  await expect(page.getByText("You can leave this screen: we'll tell you when it's done.")).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Stop the import?")).toBeVisible();
  await dialog.getByRole("button", { name: "Stop the import" }).click();
  await expect(page.getByText(/Stopping after the rows being added now/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Import stopped" })).toBeVisible({
    timeout: WORKER_STEP_MS,
  });

  const added = Number((await countOf(page, "New leads").innerText()).replaceAll(/\D/g, ""));
  expect(added).toBeGreaterThan(0);
  expect(added).toBeLessThan(ROWS);
  await expect(countOf(page, "Rows not added")).toContainText((ROWS - added).toLocaleString("en-IN"));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download the .* rows not added$/ }).click();
  const report = await readDownload(await downloading);
  expect(report.rows).toHaveLength(ROWS - added);
  expect(new Set(report.rows.map((row) => row.cells[0]))).toEqual(new Set(["Stopped before this row"]));
});
