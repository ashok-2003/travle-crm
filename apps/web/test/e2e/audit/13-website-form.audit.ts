// The visual audit's website form (website form plan, Task F5): the agency's screens (the Lead sources row, the form's
// page in each state, the snippet, Preview and Change the link), the visitor's form (three colours, each way of asking,
// the thank-you, a closed form, a link that is gone, the waiting words, a refusal) and the embed on an agency's own
// website. The consent line on a person's card is shot only while `features.marketingConsent` is on.
import type { FrameLocator } from "@playwright/test";
import { features } from "@travel-crm/contracts/features";
import { expect, signInByEmail, test } from "../support/fixtures";
import { logoPng, saveBusinessProfile } from "../support/documents";
import { embedHost } from "../support/embed-host";
import { callApi } from "../support/leads";
import { setSubscriptionState } from "../support/subscription-states";
import {
  backToActive,
  backToPlan,
  fillVisitor,
  keyOf,
  leadsOfPhone,
  moveToPlan,
  newAddress,
  newPhone,
  openForm,
  openHosted,
  postEnquiry,
  turnOnForm,
  viaProxy,
  visitorsDevice,
} from "../support/website-form";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const page_ = "/settings/lead-sources/website-form";

const words = {
  heading: "Plan your Goa holiday",
  introduction: "Tell us a little and we will call you back the same day.",
  thankYouMessage: "Thank you! We will call you within a few hours.",
  websiteUrl: "https://sharma.example",
  websiteButtonText: "Back to Sharma Travels",
  privacyUrl: "https://sharma.example/privacy",
};

test("website form: the agency's screens", async ({ page, request, agency, database }) => {
  test.setTimeout(600_000);
  const { platform } = database;
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);

  // The Lead sources row, off.
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("heading", { level: 2, name: "Website form" })).toBeVisible();
  await expect(page.getByText("Off", { exact: true }).first()).toBeVisible();
  await shoot(page, "website-form-row-off");

  // The page loading, then not loading, then never turned on.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/trpc/*websiteForm.get*", async (route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  await page.goto(page_);
  await shoot(page, "website-form-page-loading", { skeleton: true });
  release();
  await expect(page.getByRole("heading", { level: 1, name: "Website form" })).toBeVisible();
  await page.unroute("**/api/trpc/*websiteForm.get*");
  await page.route("**/api/trpc/*websiteForm.get*", (route) => route.fulfill({ status: 500, json: { error: {} } }));
  await page.reload();
  // The query tries a few times before it gives up.
  await expect(page.getByText("We couldn't load the website form.")).toBeVisible({ timeout: 30_000 });
  await shoot(page, "website-form-page-load-failed");
  await page.unroute("**/api/trpc/*websiteForm.get*");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Take enquiries from the form" })).not.toBeChecked();
  await shoot(page, "website-form-page-new");

  // On, with words, a few enquiries to count, and the row on.
  const view = await turnOnForm(page, words);
  const key = keyOf(view);
  const visitorAddress = viaProxy(newAddress());
  const { openedToken } = await openForm(request, key, { headers: visitorAddress });
  const asker = newPhone();
  await postEnquiry(request, key, { phone: asker, openedToken }, visitorAddress);
  await postEnquiry(request, key, { phone: asker, openedToken, message: "Can we add a day?" }, viaProxy(newAddress()));
  await page.goto("/settings/lead-sources");
  await expect(page.getByText("Open to anyone with the link")).toBeVisible();
  await shoot(page, "website-form-row-on");
  await page.goto(page_);
  await expect(page.getByLabel("The form's address")).toHaveValue(/\/f\//);
  await expect(page.getByText("Last 30 days")).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  await shoot(page, "website-form-page-on");

  // A link that is not https: its sentence under the field.
  const link = page.getByLabel("Website link");
  await link.fill("http://sharma.example");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Use a full https:// web address, with a site name and no login in it.")).toBeVisible();
  await shoot(page, "website-form-page-refused");
  await link.fill(words.websiteUrl);

  // Change the link, the snippet in each tab, and with embedding off.
  await page.getByRole("button", { name: "Change the link" }).click();
  await expect(page.getByRole("alertdialog", { name: "Change the link?" })).toBeVisible();
  await shoot(page, "website-form-change-link");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Copy the snippet" }).click();
  const snippet = page.getByRole("dialog", { name: "Put the form on your website" });
  await expect(snippet).toBeVisible();
  await shoot(page, "website-form-snippet-script");
  await snippet.getByRole("tab", { name: "Iframe" }).click();
  await shoot(page, "website-form-snippet-iframe");
  await snippet.getByRole("button", { name: "Done" }).click();
  const embedSwitch = page.getByRole("switch", { name: "Allow my website to show this form" });
  await embedSwitch.click();
  await page.getByRole("button", { name: "Copy the snippet" }).click();
  await expect(snippet.getByText(/The snippet is off/)).toBeVisible();
  await shoot(page, "website-form-snippet-off");
  await snippet.getByRole("button", { name: "Done" }).click();
  await embedSwitch.click();

  // Preview at both widths.
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Preview" });
  await expect(preview.getByLabel("Your name")).toHaveValue("Asha Rao");
  await preview.getByRole("radio", { name: "Phone" }).click();
  await shoot(page, "website-form-preview-phone");
  await preview.getByRole("radio", { name: "Computer" }).click();
  await shoot(page, "website-form-preview-computer");
  await preview.getByRole("button", { name: "Done" }).click();

  // Read-only: the row says Unavailable, Save is off, Turn off stays open.
  await setSubscriptionState(platform, agency.organizationId, "read_only");
  await page.goto("/settings/lead-sources");
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await shoot(page, "website-form-row-unavailable");
  await page.goto(page_);
  await expect(page.getByText(/Closed\. Your subscription is read-only/)).toBeVisible();
  await shoot(page, "website-form-page-read-only");
  await backToActive(platform, agency.organizationId);

  // A plan without it, and the demo.
  const original = await moveToPlan(platform, agency.organizationId, "without-crm");
  await page.goto(page_);
  await expect(page.getByRole("alert").first()).toBeVisible();
  await shoot(page, "website-form-page-closed");
  await moveToPlan(platform, agency.organizationId, "demo");
  await page.goto(page_);
  await expect(page.getByText("Not available in the demo.")).toBeVisible();
  await shoot(page, "website-form-page-demo");
  await backToPlan(platform, agency.organizationId, original);
});

test("website form: the visitor's screens", async ({ page, browser, agency }) => {
  test.setTimeout(600_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await page.goto("/settings/branding");
  await page.getByLabel("Logo image").setInputFiles(logoPng);
  await expect(page.getByText("Logo saved")).toBeVisible();
  const key = keyOf(await turnOnForm(page, { ...words, privacyUrl: words.privacyUrl }));
  const visitor = await visitorsDevice(browser);
  const ready = async () => {
    const form = await openHosted(visitor, key);
    await expect(form.getByLabel("Your name", { exact: true })).toBeVisible();
    await expect(form.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
    return form;
  };
  const colour = (brandColour: string | null) =>
    callApi(page, "organization.branding.update", { brandColour, documentTerms: null });

  await shoot(await ready(), "website-form-hosted-blue");
  await colour("#7a2e1d");
  await shoot(await ready(), "website-form-hosted-dark");
  await colour("#f5e6a8");
  await shoot(await ready(), "website-form-hosted-light");

  // Only a name and a phone.
  await turnOnForm(page, {
    ...words,
    emailMode: "off",
    destinationMode: "off",
    travelMonthMode: "off",
    travellersMode: "off",
    budgetMode: "off",
    messageMode: "off",
  });
  await shoot(await ready(), "website-form-hosted-minimal");

  // Every question required, sent empty.
  await turnOnForm(page, {
    ...words,
    emailMode: "required",
    destinationMode: "required",
    travelMonthMode: "required",
    travellersMode: "required",
    budgetMode: "required",
    messageMode: "required",
  });
  const required = await ready();
  await required.getByRole("button", { name: "Send enquiry" }).click();
  await expect(required.getByText("Please fill this in.").first()).toBeVisible();
  await shoot(required, "website-form-hosted-required");

  // A refusal above Send, with what was typed kept.
  await turnOnForm(page, { ...words });
  const refused = await ready();
  await fillVisitor(refused, { name: "Meera Pillai", phone: newPhone() });
  await refused
    .getByLabel("Anything else we should know?")
    .fill("see http://one.example then http://two.example and http://three.example");
  await refused.waitForTimeout(2_200);
  await refused.getByRole("button", { name: "Send enquiry" }).click();
  await expect(refused.getByText("Please take the web links out of your message.")).toBeVisible();
  await shoot(refused, "website-form-hosted-refusal");

  // The thank-you.
  const sending = await ready();
  await fillVisitor(sending, { name: "Meera Pillai", phone: newPhone() });
  await sending.waitForTimeout(2_200);
  await sending.getByRole("button", { name: "Send enquiry" }).click();
  await expect(sending.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  await shoot(sending, "website-form-thank-you");

  // Closed, then a link that is gone.
  await callApi(page, "websiteForm.turnOff", {});
  const closed = await openHosted(visitor, key);
  await expect(closed.getByText("This form isn't taking enquiries right now.")).toBeVisible();
  await shoot(closed, "website-form-unavailable");
  await callApi(page, "websiteForm.turnOn", {});
  await callApi(page, "websiteForm.changeLink", {});
  const gone = await openHosted(visitor, key);
  await expect(gone.getByText("This form link doesn't work any more.")).toBeVisible();
  await shoot(gone, "website-form-not-found");

  // The api waking, and an api that fails.
  const live = keyOf(await callApi(page, "websiteForm.get", {}));
  const late = await visitor.newPage();
  await late.route("**/api/public/website-forms/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    await route.continue();
  });
  await late.goto(`/f/${live}`);
  await expect(late.getByText("Getting the form ready. This can take a minute.")).toBeVisible({ timeout: 10_000 });
  await shoot(late, "website-form-waking");
  await late.close();
  const failing = await visitor.newPage();
  await failing.route("**/api/public/website-forms/**", (route) => route.fulfill({ status: 500, body: "" }));
  await failing.goto(`/f/${live}`);
  await expect(failing.getByRole("button", { name: "Try again" })).toBeVisible();
  await shoot(failing, "website-form-load-failed");
});

test("website form: the embed on an agency's website", async ({ page, browser, agency }) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await callApi(page, "organization.branding.update", { brandColour: "#7a2e1d", documentTerms: null });
  const key = keyOf(await turnOnForm(page, { ...words, allowEmbed: true }));
  const visitor = await visitorsDevice(browser);
  const host = await embedHost(visitor, process.env.E2E_BASE_URL ?? "");
  const site = await visitor.newPage();
  await site.goto(host.pageWith(key));
  const frame = site.frameLocator('iframe[title="Enquiry form"]');
  await expect(frame.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
  await shoot(site, "website-form-embed");
  await fillInFrame(frame, { name: "Meera Pillai", phone: newPhone() });
  await site.waitForTimeout(2_200);
  await frame.getByRole("button", { name: "Send enquiry" }).click();
  await expect(frame.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  await shoot(site, "website-form-embed-thank-you");

  await turnOnForm(page, { ...words, allowEmbed: false });
  const closed = await visitor.newPage();
  await closed.goto(host.pageWith(key));
  await expect(
    closed.frameLocator('iframe[title="Enquiry form"]').getByText("This form isn't taking enquiries right now."),
  ).toBeVisible();
  await shoot(closed, "website-form-embed-closed");
});

test("website form: the offers consent on a person's card", async ({ page, request, agency }) => {
  test.skip(!features.marketingConsent, "the switch is off (spec 0.1.2): the card shows nothing to shoot");
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page, { ...words, offersTickbox: true }));
  const headers = viaProxy(newAddress());
  const { openedToken } = await openForm(request, key, { headers });
  const phone = newPhone();
  await postEnquiry(request, key, { phone, openedToken, offers: true }, headers);
  const [lead] = await leadsOfPhone(page, phone);
  await page.goto(`/leads/${lead?.id ?? ""}`);
  await expect(page.getByText(/Agreed to offers on/)).toBeVisible();
  await shoot(page, "website-form-person-consent");
});

/** The embed's frame has no page of its own to fill from, so its fields are found in the frame. */
async function fillInFrame(frame: FrameLocator, { name, phone }: { name: string; phone: string }): Promise<void> {
  await frame.getByLabel("Your name", { exact: true }).fill(name);
  await frame.getByLabel("Phone", { exact: true }).fill(phone);
}
