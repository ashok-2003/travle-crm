// When the form can't be used (spec 13, journey 8): switched off, a read-only agency, a suspended one, a plan without crm,
// the demo, and a changed link each show the visitor the one page, whatever the reason; the old link and the snippet pasted
// with it say they don't work any more; and Turn off and Change the link work for the Owner while the agency is read-only.
import type { PlatformClient } from "@travel-crm/db/platform";
import { DEMO_PLAN_KEY } from "@travel-crm/domain/subscriptions";
import type { WebsiteFormView } from "@travel-crm/contracts/website-forms";
import { expect, signInByEmail, test } from "./support/fixtures";
import { embedHost } from "./support/embed-host";
import { callApi } from "./support/leads";
import { setSubscriptionState } from "./support/subscription-states";
import { keyOf, openHosted, turnOnForm, visitorsDevice } from "./support/website-form";

const closed = "This form isn't taking enquiries right now.";
const gone = "This form link doesn't work any more.";

const DAY = 24 * 60 * 60 * 1000;

/** Back on an active subscription, paid for a year, as the fixture made it. */
async function backToActive(platform: PlatformClient, organizationId: string): Promise<void> {
  await platform.subscription.update({
    where: { organizationId },
    data: { status: "active", statusChangedAt: new Date(), paidThrough: new Date(Date.now() + 365 * DAY) },
  });
}

/** Moves the agency onto the plan with this key (made when it is not there), and back with the id it had. */
async function onPlan(platform: PlatformClient, organizationId: string, key: string): Promise<string> {
  const before = await platform.subscription.findUniqueOrThrow({ where: { organizationId }, select: { planId: true } });
  const plan = await platform.plan.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: key === DEMO_PLAN_KEY ? "Demo" : "Without crm",
      monthlyPricePaise: 0,
      seatLimit: 10,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000_000n,
      modules: key === DEMO_PLAN_KEY ? ["crm", "catalog"] : ["catalog"],
      forSale: false,
    },
    select: { id: true },
  });
  await platform.subscription.update({ where: { organizationId }, data: { planId: plan.id } });
  return before.planId;
}

test("every way a form can be closed shows the one page; a changed link breaks the old one and its snippet", async ({
  page,
  browser,
  agency,
  database,
}) => {
  // Eight states, each a page of its own in the visitor's browser.
  test.slow();
  const { platform } = database;
  await signInByEmail(page, agency.owner);
  const first = await turnOnForm(page, { websiteUrl: "https://sharma.example" });
  const key = keyOf(first);
  const visitor = await visitorsDevice(browser);
  const shows = async (formKey: string, sentence: string) => {
    const visitorPage = await openHosted(visitor, formKey);
    await expect(visitorPage.getByText(sentence)).toBeVisible();
    return visitorPage;
  };

  // Switched off.
  await callApi(page, "websiteForm.turnOff", {});
  const off = await shows(key, closed);
  // The agency's name and the way back to its website, nothing about why.
  await expect(off.getByText("Sharma Travels")).toBeVisible();
  await expect(off.getByRole("link", { name: "Back to our website" })).toHaveAttribute(
    "href",
    "https://sharma.example",
  );
  await callApi(page, "websiteForm.turnOn", {});

  // A suspended agency, then a plan without crm, then the demo.
  await setSubscriptionState(platform, agency.organizationId, "suspended");
  await shows(key, closed);
  await backToActive(platform, agency.organizationId);
  const original = await onPlan(platform, agency.organizationId, "journey-without-crm");
  await shows(key, closed);
  await onPlan(platform, agency.organizationId, DEMO_PLAN_KEY);
  await shows(key, closed);
  await platform.subscription.update({ where: { organizationId: agency.organizationId }, data: { planId: original } });
  const back = await openHosted(visitor, key);
  await expect(back.getByLabel("Your name", { exact: true })).toBeVisible();

  // A read-only agency: the visitor sees the same page, and the Owner can still turn the form off and change the link.
  await setSubscriptionState(platform, agency.organizationId, "read_only");
  await shows(key, closed);
  await page.goto("/settings/lead-sources/website-form");
  await expect(page.getByRole("heading", { level: 1, name: "Website form" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  const turnedOff = page.waitForResponse((response) => response.url().includes("websiteForm.turnOff"));
  await page.getByRole("switch", { name: "Take enquiries from the form" }).click();
  expect((await turnedOff).ok()).toBe(true);
  await expect(page.getByRole("switch", { name: "Take enquiries from the form" })).not.toBeChecked();
  const oldLink = await page.getByLabel("The form's address").inputValue();
  await page.getByRole("button", { name: "Change the link" }).click();
  await page
    .getByRole("alertdialog", { name: "Change the link?" })
    .getByRole("button", { name: "Change the link" })
    .click();
  await expect(page.getByLabel("The form's address")).not.toHaveValue(oldLink);
  const newLink = await page.getByLabel("The form's address").inputValue();
  expect(newLink).not.toBe(oldLink);

  // Paid again and on again: the new link works, and the old link and the snippet pasted with it don't.
  await backToActive(platform, agency.organizationId);
  const view = await callApi<WebsiteFormView>(page, "websiteForm.turnOn", {});
  const newKey = keyOf(view);
  expect(newKey).not.toBe(key);
  const fresh = await openHosted(visitor, newKey);
  await expect(fresh.getByLabel("Your name", { exact: true })).toBeVisible();
  await shows(key, gone);
  const host = await embedHost(visitor, process.env.E2E_BASE_URL ?? "");
  const snippetPage = await visitor.newPage();
  await snippetPage.goto(host.pageWith(key));
  await expect(snippetPage.frameLocator('iframe[title="Enquiry form"]').getByText(gone)).toBeVisible();
});
