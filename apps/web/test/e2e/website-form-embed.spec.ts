// The form on an agency's own website (spec 13, journey 9): a page on another origin loads embed.js, the frame appears,
// sizes itself, takes an enquiry (the lead arrives, naming the website) and shows the thank-you; with embedding off the
// frame says the form isn't available; /f/ cannot be framed by anyone, and /embed/ can.
import { expect, signInByEmail, test } from "./support/fixtures";
import { embedHost } from "./support/embed-host";
import { callApi } from "./support/leads";
import { keyOf, leadsOfPhone, newPhone, turnOnForm, visitorsDevice } from "./support/website-form";
import type { LeadDetail } from "@travel-crm/contracts/crm";

const formFrame = 'iframe[title="Enquiry form"]';

test("a website on another origin shows the form in a frame that sizes itself and takes an enquiry", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  // Fewer questions, so the form is shorter than the frame's first guess of 640 pixels and the frame has to follow it.
  const key = keyOf(
    await turnOnForm(page, { emailMode: "off", destinationMode: "off", travelMonthMode: "off", budgetMode: "off" }),
  );
  const visitor = await visitorsDevice(browser);
  const host = await embedHost(visitor, process.env.E2E_BASE_URL ?? "");
  const site = await visitor.newPage();
  await site.goto(host.pageWith(key));
  const frame = site.frameLocator(formFrame);
  await expect(frame.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect
    .poll(() => site.locator(formFrame).evaluate((element) => (element as HTMLElement).style.height))
    .not.toBe("640px");

  const phone = newPhone();
  await frame.getByLabel("Your name", { exact: true }).fill("Meera Pillai");
  await frame.getByLabel("Phone", { exact: true }).fill(phone);
  await expect(frame.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
  await site.waitForTimeout(2_200);
  await frame.getByRole("button", { name: "Send enquiry" }).click();
  await expect(frame.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();

  const [lead] = await leadsOfPhone(page, phone);
  expect(lead).toMatchObject({ source: "web_form", person: { name: "Meera Pillai" } });
  const detail = await callApi<LeadDetail>(page, "leads.get", { leadId: lead?.id });
  expect(detail.sourceDetail).toBe("agency-site.example.test");
});

test("with embedding off the frame says the form isn't available", async ({ page, browser, agency }) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page, { allowEmbed: false }));
  const visitor = await visitorsDevice(browser);
  const host = await embedHost(visitor, process.env.E2E_BASE_URL ?? "");
  const site = await visitor.newPage();
  await site.goto(host.pageWith(key));
  await expect(site.frameLocator(formFrame).getByText("This form isn't taking enquiries right now.")).toBeVisible();
});

test("the hosted form cannot be framed by another site, and the embed can", async ({ page, browser, agency }) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const visitor = await visitorsDevice(browser);
  const host = await embedHost(visitor, process.env.E2E_BASE_URL ?? "");
  const site = await visitor.newPage();
  await site.goto(host.pageFramingHosted(key));
  // The browser refuses the frame: it ends on its own error page, and no form is ever in it.
  await expect.poll(() => site.frames().map((frame) => frame.url())).toContain("chrome-error://chromewebdata/");
  await expect(site.frameLocator("#hosted").getByLabel("Your name", { exact: true })).toHaveCount(0);

  const embedded = await visitor.newPage();
  await embedded.goto(host.pageWith(key));
  await expect(embedded.frameLocator(formFrame).getByLabel("Your name", { exact: true })).toBeVisible();
});
