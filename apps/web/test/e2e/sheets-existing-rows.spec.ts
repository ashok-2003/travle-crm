// Connecting with "also check the rows already there" (spec 6.5, S14): the lead import's preview shows the group
// "Already in your CRM", left out unless ticked; adding takes the others, and the sync after adds none of the old rows.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addAndWait } from "./support/lead-import-steps";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_TAB, syncNow, waitForLead } from "./support/sheets";

test("the rows already there go through the preview; someone already in the CRM is left out unless ticked", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919820098200" } }));
  const form = await aGoogleForm(google, {
    rows: [
      answer("Priya Nair", "98450 12345"),
      answer("Meera Iyer", "98450 54321"),
      answer("Rahul Sharma", "98200 98200"),
    ],
  });
  await connectSheet(page, { link: form.link, existing: "check" });
  await expect(page.getByText("Already in your CRM").first()).toBeVisible();
  await addAndWait(page);

  await page.goto("/leads?view=everyone&source=google_sheet");
  await expect(page.getByRole("main").getByRole("link", { name: /Priya Nair/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Meera Iyer/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ })).toHaveCount(0);

  // The sync that follows takes only what arrives now.
  await google.append(form.id, FORM_TAB, answer("Kavya Rao", "98111 11111"));
  // The sheet runs once the import it waited for is done: its row in the list says so before it is opened.
  await page.goto("/settings/lead-sources");
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("link", { name: form.title }).click();
  await syncNow(page);
  await waitForLead(page, "Kavya Rao");
  await expect(page.getByRole("main").getByRole("link", { name: /Priya Nair/ })).toHaveCount(1);
});
