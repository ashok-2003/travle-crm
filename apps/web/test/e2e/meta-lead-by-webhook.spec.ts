// A lead ad's answers become a lead by themselves (spec 12): Meta's signed delivery names the lead, the worker reads it from
// Meta with the Page's token and saves it by the one save path: the person, the source "Facebook or Instagram lead ad"
// with the form and platform as its detail, the custom answer in the destination, the owner by the agency's rules. A delivery
// without a right signature saves nothing, and the same delivery again makes no second lead.
import { expect, signInByEmail, test } from "./support/fixtures";
import {
  aFacebookPage,
  answers,
  bringInForm,
  connectFacebookPage,
  deliverLeadgen,
  fakeMeta,
  waitForMetaLead,
} from "./support/meta";

test("a signed webhook lead becomes a lead with its source and detail, once", async ({ page, agency }) => {
  test.setTimeout(240_000);
  const meta = fakeMeta();
  const facebook = await aFacebookPage(meta);
  await signInByEmail(page, agency.owner);
  await connectFacebookPage(page, facebook);
  await bringInForm(page, facebook.formName);

  const leadgenId = `lead-${facebook.formId}-1`;
  await meta.addLead({
    id: leadgenId,
    formId: facebook.formId,
    platform: "instagram",
    answers: answers("Meera Nair", "+919845012345", "Udaipur"),
  });
  const change = { leadgenId, pageId: facebook.pageId, formId: facebook.formId };

  // Not Meta's: nothing is stored, and no lead follows.
  expect(await deliverLeadgen([change], { signature: "none" })).toBe(401);
  expect(await deliverLeadgen([change], { signature: "wrong" })).toBe(401);
  // Meta's own.
  expect(await deliverLeadgen([change])).toBe(200);
  await waitForMetaLead(page, "Meera Nair");

  await page
    .getByRole("main")
    .getByRole("link", { name: /Meera Nair/ })
    .first()
    .click();
  const ownerCard = page.getByRole("region", { name: "Owner and source" });
  await expect(ownerCard.getByText("Facebook or Instagram lead ad")).toBeVisible();
  await expect(ownerCard.getByText(`${facebook.formName} · Instagram`)).toBeVisible();
  await expect(page.getByText("Udaipur").first()).toBeVisible();

  // Meta delivers again (it retries): still one lead.
  expect(await deliverLeadgen([change])).toBe(200);
  await page.waitForTimeout(5_000);
  await page.goto("/leads?view=everyone&source=meta_lead_ad");
  await expect(page.getByRole("main").getByRole("link", { name: /Meera Nair/ })).toHaveCount(1);
});
