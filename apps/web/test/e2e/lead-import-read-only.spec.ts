// A read-only agency (spec 3.1, ADR 0021, 12.1): Import is off on Leads, with its hint as its description, and the
// import page's file button is off too; a import already checked can't be matched again, added or cancelled, and says
// why; the lists and the rest still open.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { checkTheRows, csvFile, startLeadImport } from "./support/lead-import-steps";
import { setSubscriptionState } from "./support/subscription-states";

const HINT = "Your organization is read-only until its payment is made. You can still view and export.";

test("a read-only agency: Import is off with its hint", async ({ page, agency, database }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  // An import checked while the agency could still change things.
  await startLeadImport(
    page,
    csvFile("enquiries-oct-2026.csv", [
      ["Name", "Phone"],
      ["Asha Rao", "98765 43210"],
    ]),
  );
  await checkTheRows(page);
  const waiting = new URL(page.url()).pathname;

  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await page.goto("/leads");
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  const button = page.getByRole("main").getByRole("button", { name: "Import" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(HINT);
  await expect(page.getByRole("main").getByRole("link", { name: "Import" })).toHaveCount(0);
  await expectAccessible(page);

  await page.goto("/leads/import");
  await expect(page.getByRole("heading", { level: 1, name: "Import leads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a file" })).toBeDisabled();
  await expectAccessible(page);

  // The waiting import: Add and Cancel are off, and say why; the columns can be looked at but not matched again.
  await page.goto(waiting);
  await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add \d+ rows?$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Add \d+ rows?$/ })).toHaveAccessibleDescription(HINT);
  await expect(page.getByRole("button", { name: "Cancel this import" })).toBeDisabled();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Change the columns" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Match columns" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check the rows" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check the rows" })).toHaveAccessibleDescription(HINT);
});
