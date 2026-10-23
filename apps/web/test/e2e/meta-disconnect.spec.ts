// Disconnecting a Page (spec 3.3, 10): the Owner is asked, the Page leaves the list and Facebook is told to stop sending
// (the webhook subscription goes), and the leads it brought stay.
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

test("disconnecting a Page asks first, unsubscribes it and keeps its leads", async ({ page, agency }) => {
  test.setTimeout(240_000);
  const meta = fakeMeta();
  const facebook = await aFacebookPage(meta);
  await signInByEmail(page, agency.owner);
  await connectFacebookPage(page, facebook);
  await bringInForm(page, facebook.formName);
  const leadgenId = `lead-${facebook.formId}-1`;
  await meta.addLead({ id: leadgenId, formId: facebook.formId, answers: answers("Kavya Rao", "+919811111111", "Goa") });
  await deliverLeadgen([{ leadgenId, pageId: facebook.pageId, formId: facebook.formId }]);
  await waitForMetaLead(page, "Kavya Rao");

  await page.goto("/settings/lead-sources");
  await page.getByRole("link", { name: facebook.pageName }).click();
  await page.getByRole("button", { name: "More actions for this Page" }).click();
  await page.getByRole("menuitem", { name: "Disconnect Page" }).click();
  const asking = page.getByRole("alertdialog");
  await expect(asking.getByText(`Stop bringing in leads from ${facebook.pageName}?`)).toBeVisible();
  await expect(asking.getByText("Leads already here stay.")).toBeVisible();
  // Asked, not done: Facebook still holds the subscription.
  expect(await meta.subscribedPages()).toContain(facebook.pageId);
  await asking.getByRole("button", { name: "Disconnect Page" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Lead sources" })).toBeVisible();
  await expect(page.getByRole("link", { name: facebook.pageName })).toHaveCount(0);
  await expect.poll(async () => meta.subscribedPages()).not.toContain(facebook.pageId);

  // The lead it brought stays, and a delivery for the Page now saves nothing.
  await waitForMetaLead(page, "Kavya Rao");
  const later = `lead-${facebook.formId}-2`;
  await meta.addLead({ id: later, formId: facebook.formId, answers: answers("Late Person", "+919822222222", "Goa") });
  expect(await deliverLeadgen([{ leadgenId: later, pageId: facebook.pageId, formId: facebook.formId }])).toBe(200);
  await page.waitForTimeout(5_000);
  await page.goto("/leads?view=everyone&source=meta_lead_ad");
  await expect(page.getByRole("main").getByRole("link", { name: /Late Person/ })).toHaveCount(0);
});
