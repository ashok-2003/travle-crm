// "Also check the last 30 days" (spec Q3, 3.4): bringing a form in with the second choice makes an import named after the
// form from Facebook's earlier leads, which opens at the lead import's preview. Someone who already has a lead is in the
// group "Already in your CRM", left out unless ticked; adding takes the others.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addAndWait } from "./support/lead-import-steps";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { aFacebookPage, answers, bringInForm, connectFacebookPage, fakeMeta } from "./support/meta";

const DAY = 86_400_000;

test("the last 30 days go through the preview; someone already in the CRM is left out unless ticked", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  const meta = fakeMeta();
  const facebook = await aFacebookPage(meta);
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919820098200" } }));
  const days = (count: number) => new Date(Date.now() - count * DAY);
  for (const [index, [name, phone, when]] of (
    [
      ["Priya Nair", "+919845012345", days(3)],
      ["Meera Iyer", "+919845054321", days(10)],
      ["Rahul Sharma", "+919820098200", days(5)],
    ] as const
  ).entries()) {
    await meta.addLead({
      id: `earlier-${facebook.formId}-${String(index)}`,
      formId: facebook.formId,
      answers: answers(name, phone, "Jaipur"),
      createdAt: when,
    });
  }
  await connectFacebookPage(page, facebook);
  await bringInForm(page, facebook.formName, "last_30_days");

  // The import carries the form's name, and says where its rows came from.
  await expect(page.getByText(/From your Facebook or Instagram lead form, the last 30 days/)).toBeVisible();
  await expect(page.getByText("Already in your CRM").first()).toBeVisible();
  await addAndWait(page);

  await page.goto("/leads?view=everyone&source=meta_lead_ad");
  await expect(page.getByRole("main").getByRole("link", { name: /Priya Nair/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Meera Iyer/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ })).toHaveCount(0);
});
