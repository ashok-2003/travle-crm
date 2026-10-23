// The visual audit's Facebook and Instagram lead ads (Meta release, web track): Lead sources with Pages, the connect step and
// the Page choice (and a cancelled dialog), a Page's page running, with problems and in each state that stops it, bringing a
// form in and editing its questions, the import's preview of the last 30 days, Disconnect, and read-only. Pages are connected
// through the product against the fake Meta; the states are written into the database the way the worker would leave them,
// since a camera cannot wait for a token to expire.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "../support/fixtures";
import { addLeadThroughApi, leadInput } from "../support/leads";
import {
  aFacebookPage,
  anotherForm,
  answers,
  bringInForm,
  connectFacebookPage,
  fakeMeta,
  FORM_QUESTIONS,
} from "../support/meta";
import { setSubscriptionState } from "../support/subscription-states";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const DAY = 86_400_000;

/** The ⋯ menu of a Page's page opened on its Disconnect Page item. */
async function openDisconnect(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More actions for this Page" }).click();
  await page.getByRole("menuitem", { name: "Disconnect Page" }).click();
}

test("Facebook and Instagram lead ads: connecting, a Page's page and each state that stops it", async ({
  page,
  agency,
  database,
}) => {
  test.setTimeout(600_000);
  const meta = fakeMeta();
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919820098200" } }));

  // The connect step, and the Page choice with a Page the person may not advertise on.
  const facebook = await aFacebookPage(meta);
  await meta.addLogin(`${facebook.code}-more`, {
    userId: `user-${facebook.code}`,
    pages: [
      { id: facebook.pageId, name: facebook.pageName, token: facebook.token, canAdvertise: true },
      {
        id: `${facebook.pageId}7`,
        name: "Kerala Backwaters (a client's Page)",
        token: `${facebook.token}7`,
        canAdvertise: false,
      },
    ],
  });
  await page.goto("/settings/lead-sources/meta/connect");
  await shoot(page, "meta-connect");
  await page.route("https://www.facebook.com/**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "";
    await route.fulfill({
      status: 302,
      headers: {
        location: `${process.env.E2E_BASE_URL ?? ""}/settings/lead-sources/meta/callback?code=${facebook.code}-more&state=${encodeURIComponent(state)}`,
      },
    });
  });
  await page.getByRole("button", { name: "Continue with Facebook" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose your Pages" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("You can't advertise on this Page")).toBeVisible();
  await shoot(page, "meta-callback-choose");
  await page.unroute("https://www.facebook.com/**");
  await page.goto("/settings/lead-sources/meta/callback?error=access_denied&error_reason=user_denied");
  await expect(page.getByText("Facebook didn't finish the login.")).toBeVisible();
  await shoot(page, "meta-callback-cancelled");

  // Connect it properly: the forms of a Page, one brought in, one not (a Page's forms are read once in five minutes).
  await anotherForm(meta, facebook, "Diwali offers");
  await connectFacebookPage(page, facebook);
  const pageUrl = page.url();
  const pageRowId = pageUrl.split("/").at(-1) ?? "";
  await page.goto(pageUrl);
  await expect(page.getByLabel("Lead forms on this Page")).toContainText("Diwali offers");
  await page.getByRole("link", { name: `Bring in ${facebook.formName}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Match ${facebook.formName}` })).toBeVisible();
  await shoot(page, "meta-bring-in");
  await page.getByRole("button", { name: "Bring in the form" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "meta-bring-in-confirm");
  await page.getByRole("alertdialog").getByRole("button", { name: "Bring in", exact: true }).click();
  await expect(page.getByRole("link", { name: `Edit the questions of ${facebook.formName}` })).toBeVisible();
  await database.platform.metaForm.updateMany({
    where: { metaPageId: pageRowId, formName: "Diwali offers" },
    data: { skippedLeads: 3 },
  });
  await page.goto(pageUrl);
  await expect(page.getByText(/3 leads came while this form wasn't brought in/)).toBeVisible();
  await shoot(page, "meta-page");

  // Leads that couldn't be added, as the worker leaves them.
  const problem = (metaLeadId: string, name: string | null, reasons: string[], platform: string) => ({
    organizationId: agency.organizationId,
    metaLeadId,
    formId: facebook.formId,
    status: "not_added",
    reasons,
    exampleName: name,
    platform,
  });
  await database.platform.metaLead.createMany({
    data: [
      problem("p1", "Meena Iyer", ["phone_invalid"], "instagram"),
      problem("p2", "Suresh Menon", ["blocked"], "facebook"),
      problem("p3", null, ["no_name", "no_contact"], "facebook"),
    ],
  });
  await page.goto(pageUrl);
  await expect(page.getByRole("heading", { name: "Leads that couldn't be added" })).toBeVisible();
  await shoot(page, "meta-page-problems");

  // Edit the questions of the form once Facebook has added one.
  await meta.setQuestions(facebook.formId, [
    ...FORM_QUESTIONS,
    { key: "budget_for_the_trip", type: "custom", label: "Budget for the trip" },
  ]);
  await page.getByRole("link", { name: `Edit the questions of ${facebook.formName}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Questions of ${facebook.formName}` })).toBeVisible();
  await shoot(page, "meta-questions");

  // Each state that stops a Page.
  await database.platform.metaPage.update({
    where: { id: pageRowId },
    data: { status: "needs_reconnect", attentionSince: new Date(Date.now() - 26 * 3_600_000) },
  });
  await page.goto(pageUrl);
  await expect(page.getByText("Facebook stopped sharing this Page")).toBeVisible();
  await shoot(page, "meta-page-needs-reconnect");
  await database.platform.metaPage.update({
    where: { id: pageRowId },
    data: { status: "running", attentionSince: null, tokenExpiresAt: new Date(Date.now() + 3 * DAY) },
  });
  await page.goto(pageUrl);
  await expect(page.getByText(/Facebook's access for this Page ends on/)).toBeVisible();
  await shoot(page, "meta-page-expiring");
  await database.platform.metaPage.update({
    where: { id: pageRowId },
    data: { status: "paused", tokenExpiresAt: null },
  });
  await page.goto(pageUrl);
  await expect(page.getByText("This Page is paused")).toBeVisible();
  await shoot(page, "meta-page-paused");
  await database.platform.metaPage.update({ where: { id: pageRowId }, data: { status: "running" } });
  await database.platform.metaForm.updateMany({
    where: { metaPageId: pageRowId, formName: facebook.formName },
    data: { state: "needs_attention" },
  });
  await page.goto(pageUrl);
  await expect(page.getByText("A form's questions changed")).toBeVisible();
  await shoot(page, "meta-page-form-changed");
  await database.platform.metaForm.updateMany({
    where: { metaPageId: pageRowId, formName: facebook.formName },
    data: { state: "running" },
  });

  // Disconnect asks, naming what stays.
  await page.goto(pageUrl);
  await openDisconnect(page);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "meta-disconnect");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  // The list, with a second Page that needs reconnecting.
  const second = await aFacebookPage(meta, { pageName: "Kerala Backwaters", formName: "Kerala monsoon ad" });
  await connectFacebookPage(page, second);
  const secondId = page.url().split("/").at(-1) ?? "";
  await database.platform.metaPage.update({
    where: { id: secondId },
    data: { status: "needs_reconnect", attentionSince: new Date(Date.now() - 26 * 3_600_000) },
  });
  await page.goto("/settings/lead-sources");
  await expect(page.getByText("Needs reconnecting", { exact: true })).toBeVisible();
  await shoot(page, "meta-lead-sources");

  // The last 30 days of a third Page's form, at the import's preview.
  const third = await aFacebookPage(meta, { pageName: "Goa Beach Escapes", formName: "Goa weekend ad" });
  for (const [index, [name, phone, days]] of (
    [
      ["Priya Nair", "+919845012345", 3],
      ["Meera Iyer", "+919845054321", 10],
      ["Rahul Sharma", "+919820098200", 5],
    ] as const
  ).entries()) {
    await meta.addLead({
      id: `audit-${third.formId}-${String(index)}`,
      formId: third.formId,
      answers: answers(name, phone, "Goa"),
      createdAt: new Date(Date.now() - days * DAY),
    });
  }
  await connectFacebookPage(page, third);
  await bringInForm(page, third.formName, "last_30_days");
  await expect(page.getByText("Already in your CRM").first()).toBeVisible();
  await shoot(page, "meta-import-check");

  // The subscription is read-only.
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await page.goto(pageUrl);
  await expect(page.getByText("Your agency can't change anything right now")).toBeVisible();
  await shoot(page, "meta-page-read-only");
});
