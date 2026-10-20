// A sheet that has stopped (spec 6.5, S40-S43): a tab that is gone, columns that are gone and no manager each say what
// happened and give the one thing to do, and each screen passes axe. The states are written into the database the way the
// worker would leave them, as the camera does, since a journey cannot wait for a sheet to fail.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, connectSheet, fakeGoogle } from "./support/sheets";

test("a missing tab, missing columns and no manager: each says what to do, and each screen is accessible", async ({
  page,
  agency,
  database,
}) => {
  test.slow();
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")] });
  await connectSheet(page, { link: form.link, existing: "only_new" });
  const sheetUrl = page.url();
  const sheetId = sheetUrl.split("/").at(-1) ?? "";
  const stopped = { attentionSince: new Date(Date.now() - 26 * 60 * 60_000) };

  await database.platform.sheetConnection.update({
    where: { id: sheetId },
    data: { status: "tab_missing", ...stopped },
  });
  await page.goto(sheetUrl);
  await expect(page.getByText("This sheet's tab is gone")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Tab" })).toBeVisible();
  await expectAccessible(page);

  await database.platform.sheetConnection.update({
    where: { id: sheetId },
    data: { status: "columns_missing", ...stopped },
  });
  await database.platform.sheetColumn.updateMany({
    where: { connectionId: sheetId, field: { in: ["name", "phone"] } },
    data: { isMissing: true },
  });
  await page.goto(sheetUrl);
  await expect(page.getByText("A column we need is gone")).toBeVisible();
  // The alert offers matching again once: the Columns section does not repeat it.
  await expect(page.getByRole("link", { name: "Match columns again" })).toHaveCount(1);
  await expectAccessible(page);

  await database.platform.sheetColumn.updateMany({ where: { connectionId: sheetId }, data: { isMissing: false } });
  await database.platform.sheetConnection.update({
    where: { id: sheetId },
    data: { status: "needs_manager", ...stopped },
  });
  await page.goto(sheetUrl);
  await expect(page.getByText("This sheet needs a manager")).toBeVisible();
  await expectAccessible(page);
});
