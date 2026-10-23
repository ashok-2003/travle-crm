// A form nobody brought in (spec Q4): a lead from a new form on a connected Page is never saved silently. The Owner is told
// once ("A lead came from 'Diwali offers', a form you haven't brought in"), a second lead from it adds no second notice,
// and the Page's page says how many came meanwhile.
import { expect, signInByEmail, test } from "./support/fixtures";
import {
  aFacebookPage,
  anotherForm,
  answers,
  bringInForm,
  connectFacebookPage,
  deliverLeadgen,
  fakeMeta,
} from "./support/meta";

test("a lead from a form not brought in saves no lead and tells the Owner once", async ({ page, agency }) => {
  test.setTimeout(240_000);
  const meta = fakeMeta();
  const facebook = await aFacebookPage(meta);
  await signInByEmail(page, agency.owner);
  await connectFacebookPage(page, facebook);
  await bringInForm(page, facebook.formName);

  const newFormId = await anotherForm(meta, facebook, "Diwali offers");
  for (const number of [1, 2]) {
    const leadgenId = `lead-${newFormId}-${String(number)}`;
    await meta.addLead({
      id: leadgenId,
      formId: newFormId,
      answers: answers(`Skipped Person ${String(number)}`, `+91984501234${String(number)}`, "Goa"),
    });
    expect(await deliverLeadgen([{ leadgenId, pageId: facebook.pageId, formId: newFormId }])).toBe(200);
  }

  // The Page's page counts them against the new form, and offers to bring it in.
  await expect(async () => {
    await page.goto("/settings/lead-sources");
    await page.getByRole("link", { name: facebook.pageName }).click();
    await expect(page.getByText("2 leads came while this form wasn't brought in.")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole("link", { name: "Bring in Diwali offers" })).toBeVisible();

  // No lead was saved.
  await page.goto("/leads?view=everyone&source=meta_lead_ad");
  await expect(page.getByRole("main").getByRole("link", { name: /Skipped Person/ })).toHaveCount(0);

  // The Owner has one notice for the form, not two.
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell.getByText("A lead came from 'Diwali offers', a form you haven't brought in")).toHaveCount(1);
});
