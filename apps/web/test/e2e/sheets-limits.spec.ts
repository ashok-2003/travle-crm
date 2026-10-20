// What refuses a sheet (spec 6.5, S4, S5, S8): an Excel file in Drive, a sheet not shared, the same tab twice, a sheet that
// another agency holds (a generic sentence, naming nothing), and the sixth sheet. Disconnecting it elsewhere frees it.
import { expect, signInByEmail, test } from "./support/fixtures";
import { aGoogleForm, answer, fakeGoogle, linkTo, pasteSheetLink, connectSheet } from "./support/sheets";

test("the refusals each have their sentence; the sixth sheet is refused; another agency's sheet is generic", async ({
  page,
  agency,
}) => {
  test.slow();
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);

  const excelId = `excel${Date.now().toString(36)}`.padEnd(30, "z");
  await google.addSpreadsheet({ id: excelId, title: "Leads.xlsx", kind: "excel", tabs: [] });
  await google.share(excelId);
  await pasteSheetLink(page, linkTo(excelId));
  await expect(page.getByText(/That is an Excel file kept in Google Drive/)).toBeVisible();

  const unshared = await aGoogleForm(google, { shared: false });
  await pasteSheetLink(page, unshared.link);
  await expect(page.getByText(/We can't open that sheet yet/)).toBeVisible();

  const first = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")], title: "First" });
  await connectSheet(page, { link: first.link, existing: "only_new" });
  await pasteSheetLink(page, first.link);
  await expect(page.getByText("This sheet is already connected here.")).toBeVisible();

  for (let index = 2; index <= 5; index += 1) {
    const form = await aGoogleForm(google, { title: `Sheet ${String(index)}` });
    await connectSheet(page, { link: form.link, existing: "only_new" });
  }
  const sixth = await aGoogleForm(google, { title: "Sheet six" });
  await pasteSheetLink(page, sixth.link);
  await expect(page.getByText("You can connect up to 5 sheets. Disconnect one to connect another.")).toBeVisible();
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("button", { name: "Connect a sheet" })).toBeDisabled();
  await expect(page.getByText("5 of 5")).toBeVisible();
});
