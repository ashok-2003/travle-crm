// Nothing twice, nothing lost (spec 6.5, S9, S18, S23): a sheet sorted, a row inserted in the middle and a row deleted
// add only the inserted one; a person with an open lead typed by hand who fills the form is a repeat enquiry, not a
// second lead; the same row in a second connected sheet is left out as a duplicate.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_TAB, syncNow, waitForLead } from "./support/sheets";

const sheetLeads = (page: Page) => page.getByRole("main").getByRole("link", { name: /Customer|Sharma|Mid/ });

test("sorting, inserting and deleting rows adds only the inserted one", async ({ page, agency }) => {
  test.setTimeout(240_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  const form = await aGoogleForm(google, {
    rows: [
      answer("Zed Customer", "98100 00001"),
      answer("Amy Customer", "98100 00002"),
      answer("Bo Customer", "98100 00003"),
    ],
  });
  await connectSheet(page, { link: form.link, existing: "only_new" });

  await google.sort(form.id, FORM_TAB, { column: 1 });
  await google.insertAt(form.id, FORM_TAB, 3, answer("Mid Person", "98100 00009"));
  await google.deleteAt(form.id, FORM_TAB, 2);
  await syncNow(page);
  await waitForLead(page, "Mid Person");
  await expect(page.getByRole("main").getByRole("link", { name: /Customer/ })).toHaveCount(0);
  await expect(sheetLeads(page)).toHaveCount(1);
});

test("a repeat enquiry joins the open lead, and the same row in a second sheet is a duplicate", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919820098200" } }));
  const first = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")], title: "First form" });
  const second = await aGoogleForm(google, { rows: [answer("Priya Nair", "98450 12345")], title: "Second form" });
  await connectSheet(page, { link: first.link, existing: "only_new" });
  const firstPage = page.url();
  await connectSheet(page, { link: second.link, existing: "only_new" });
  const secondPage = page.url();

  const row = answer("Rahul Sharma", "98200 98200");
  await google.append(first.id, FORM_TAB, row);
  await page.goto(firstPage);
  await syncNow(page);
  await expect(page.getByRole("listitem").filter({ hasText: "Added to an existing lead" })).toContainText("1");
  await page.goto("/leads?view=everyone");
  await expect(page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ })).toHaveCount(1);

  await google.append(second.id, FORM_TAB, row);
  await page.goto(secondPage);
  await syncNow(page);
  await expect(page.getByRole("listitem").filter({ hasText: "Left out as duplicates" })).toContainText("1");
  await waitForLead(page, "Rahul Sharma").catch(() => undefined);
  await page.goto("/leads?view=everyone");
  await expect(page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ })).toHaveCount(1);
});
