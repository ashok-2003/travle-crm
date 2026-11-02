// "Fill it for me" (release ai2a), on a phone and a desktop, against the real api and worker with the fake AI (the fake reads
// nothing: it answers one scripted proposal per form). The AI proposes, a person applies and saves:
// - a new lead from typed words: the sheet shows what was found, Apply fills the form in violet without saving, and the save is audited;
// - a lead from a past customer's chat: the form opens with the AI's reading of the chat and the chat's own number;
// - a call note from a recording: the dialog is filled, the follow-up has a real date, and one tap saves the call and the lead's details;
// - a quote from a screenshot: its text is filled and every price stays empty;
// - a new WhatsApp lead arrives with fields suggested in violet, and Confirm keeps them.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInToConsole, test } from "./support/console";
import { saveBusinessProfile } from "./support/documents";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openNewChat,
} from "./support/whatsapp";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai2a");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(shots, `${testInfo.project.name}-${name}.png`) });
  if (before !== null) await page.setViewportSize(before);
}

const turnOnAi = (page: Page) => callApi(page, "ai.saveSettings", { enabled: true, scoring: true, instructions: "" });

test("a new lead is filled from words, checked in violet and saved, drafted by AI and approved by the Owner", async ({
  page,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  await page.goto("/leads/new");
  await page.getByRole("button", { name: "Fill with AI" }).click();
  const sheet = page.getByRole("dialog", { name: "Fill it for me" });
  await sheet
    .getByLabel("What you know")
    .fill("Rahul Sharma 98765 43210 Manali jana hai 15 se 20 Dec, 4 log, 1 lakh tak");
  await sheet.getByRole("button", { name: "Fill the form" }).click();

  // The proposal: every field empty on the form is ticked; each with the words it came from.
  await expect(sheet.getByRole("checkbox", { name: /Destination/ })).toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: /Budget/ })).toBeChecked();
  await expect(sheet.getByText("Manali jana hai")).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "fill-sheet-proposal");

  // Apply fills the form, unsaved, in violet; nothing was sent to the server.
  await sheet.getByRole("button", { name: /^Apply/ }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Rahul Sharma");
  await expect(page.getByLabel("Adults")).toHaveValue("4");
  expect(await page.locator("[data-ai-filled]").count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("button", { name: "Undo AI fill" })).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "form-after-apply");
  expect(await callApi<{ items: unknown[] }>(page, "leads.list", { view: "everyone", stage: "open" })).toMatchObject({
    items: [],
  });

  // Editing a field takes its violet away; saving opens the lead.
  const marked = await page.locator("[data-ai-filled]").count();
  await page.getByLabel("Name", { exact: true }).fill("Rahul K Sharma");
  await expect(page.locator("[data-ai-filled]")).toHaveCount(marked - 1);
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rahul K Sharma" })).toBeVisible();
  await expect(page.getByText("Manali").first()).toBeVisible();

  // Audited as drafted by AI, with the one field the Owner changed; no words in the entry.
  const [entry] = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entry?.after).toMatchObject({ target: "lead", changedByMember: ["person.name"] });
  expect(JSON.stringify(entry)).not.toMatch(/Manali|98765/);
});

test("a call is written up from a recording in one tap, with the follow-up and the lead's details", async ({
  page,
  agency,
}, testInfo) => {
  // A microphone that hears a tone, in place of the person's own.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const tone = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      tone.connect(destination);
      tone.start();
      return destination.stream;
    };
  });
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  const leadId = await addLeadThroughApi(page, leadInput());
  // Manali is on the agency's list, so the call's reading of the trip lands on it.
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Other", phone: "+919876500001" },
      trip: { destination: { kind: "new", name: "Manali" } },
    }),
  );
  await page.goto(`/leads/${leadId}`);
  if (isPhone(testInfo)) {
    const call = page.getByRole("link", { name: "Call Rahul Sharma" });
    await call.evaluate((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
      });
    });
    await call.click();
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  } else {
    await page.getByRole("button", { name: "Call Rahul Sharma" }).click();
    await page.getByRole("dialog", { name: "Call Rahul Sharma" }).getByRole("button", { name: "Log the call" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "How did the call go?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fill with AI" }).click();
  const sheet = page.getByRole("dialog", { name: "Fill it for me" });
  await sheet.getByRole("button", { name: "Speak" }).click();
  await expect(sheet.getByRole("button", { name: /^Stop/ })).toBeVisible();
  await shoot(page, testInfo, "call-note-mic");
  await page.waitForTimeout(1500);
  await sheet.getByRole("button", { name: /^Stop/ }).click();
  await expect(sheet.getByText("Recording ready")).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("button", { name: "Fill the form" }).click();

  // The call's own fields and, apart, what the call said about the trip; the follow-up is a real day and time.
  await expect(sheet.getByRole("checkbox", { name: /Follow-up/ })).toBeChecked();
  await expect(sheet.getByText(/5:00 pm.*Send the Manali quote/)).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: /Destination/ })).toBeChecked();
  await shoot(page, testInfo, "call-note-proposal");
  await sheet.getByRole("button", { name: /^Apply/ }).click();
  await expect(dialog.getByText(/This tap also updates the lead/)).toBeVisible();
  await expect(dialog.getByLabel("Note")).toHaveValue(/Rahul wants Manali/);

  // One tap: the call is saved, and so are the lead's details.
  await dialog.getByRole("button", { name: "Save the call" }).click();
  await expect(page.getByText("Call saved")).toBeVisible();
  await expect(page.getByText("Manali").first()).toBeVisible();
  await expect(page.getByText(/4 adults/).first()).toBeVisible();
  const entries = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entries).toHaveLength(2);
  // The note's words are in the call, never in the audit log.
  expect(JSON.stringify(entries)).not.toMatch(/Rahul wants|Manali/);
});

test("a quote is filled from a screenshot, and every price stays empty", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const leadId = await addLeadThroughApi(page, leadInput());
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title: "Draft",
    startDate: null,
    adults: 0,
    children: 0,
    days: [],
    items: [],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
  });
  await page.goto(`/quotes/${quote.id}`);
  await page.getByRole("button", { name: "Fill with AI" }).click();
  const sheet = page.getByRole("dialog", { name: "Fill it for me" });
  // A screenshot of a competitor's quote, a 1x1 picture here.
  await sheet.getByLabel("Add a screenshot").setInputFiles({
    name: "quote.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(sheet.getByText("Screenshot ready")).toBeVisible();
  await sheet.getByRole("button", { name: "Fill the form" }).click();
  await expect(sheet.getByRole("checkbox", { name: /Lines/ })).toBeChecked();
  // The title already holds "Draft": it is not ticked, and shows before and after.
  const title = sheet.getByRole("checkbox", { name: /Title/ });
  await expect(title).not.toBeChecked();
  await expect(sheet.getByText("Now: Draft.")).toBeVisible();
  await title.check();
  // The model offered a price; the fill carries none.
  await expect(sheet.getByText("9000")).toHaveCount(0);
  await expect(sheet.getByText("1 line, price to add")).toBeVisible();
  await sheet.getByRole("button", { name: /^Apply/ }).click();

  await expect(page.getByLabel("Quote title")).toHaveValue("Manali for four");
  await expect(page.getByLabel("What", { exact: true })).toHaveValue("Hotel, 5 nights");
  await expect(page.getByLabel("Price of one")).toHaveValue("");
  await expect(page.locator("[data-ai-filled]").first()).toBeVisible();
  await shoot(page, testInfo, "quote-after-fill");

  // The price is the person's to type; without it the quote isn't saved.
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toHaveCount(0);
  await page.getByLabel("Price of one").fill("9,000");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();
  const [entry] = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entry?.after).toMatchObject({ target: "quote" });
});

test("a past customer's chat becomes a lead: the form opens with the AI's reading and the chat's own number", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await (await browser.newContext()).newPage();
  await signInByEmail(owner, agency.owner);
  await turnOnAi(owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(
    owner,
    business,
    customer,
    "Rahul Mehta",
    "Hi, Manali jana hai 15 se 20 Dec, 4 log, 1 lakh tak",
  );
  // The first enquiry became a lead; it is closed, so the customer is a past one and the chat offers a new lead.
  await expect(chat).toBeVisible();
  await owner.goto("/leads");
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  await owner.waitForURL(/\/leads\/[0-9a-f-]{36}/);
  const leadId = /\/leads\/([0-9a-f-]{36})/.exec(owner.url())?.[1] ?? "";
  await callApi(owner, "leads.moveStage", { leadId, stage: "not_a_lead" });
  await expect(async () => {
    await owner.goto("/inbox");
    await owner
      .getByRole("link", { name: /Rahul Mehta/ })
      .first()
      .click({ timeout: 4_000 });
    await owner
      .getByRole("region", { name: "Chat with Rahul Mehta" })
      .getByRole("button", { name: "More for this chat" })
      .click({ timeout: 4_000 });
    await expect(owner.getByRole("menuitem", { name: "Make a lead from this chat" })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
  await owner.getByRole("menuitem", { name: "Make a lead from this chat" }).click();

  // The form opens with the sheet already reading the chat; the person ticks and applies.
  const sheet = owner.getByRole("dialog", { name: "Fill it for me" });
  await expect(sheet.getByRole("checkbox", { name: /Phone/ })).toBeChecked({ timeout: 30_000 });
  await expect(sheet.getByText(`+${customer}`)).toBeVisible();
  await sheet.getByRole("button", { name: /^Apply/ }).click();
  await expect(owner.getByLabel("Phone", { exact: true })).toHaveValue(/\d/);
  await expect(owner.getByLabel("Name", { exact: true })).toHaveValue("Rahul Mehta");
  await owner.getByRole("button", { name: "Save lead" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Rahul Mehta" })).toBeVisible();
});

test("a new WhatsApp lead arrives with its fields suggested in violet, and Confirm keeps them", async ({
  page,
  browser,
  superAdmin,
  agency,
}, testInfo) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await (await browser.newContext()).newPage();
  await signInByEmail(owner, agency.owner);
  await turnOnAi(owner);
  // Manali is on the agency's list.
  await addLeadThroughApi(
    owner,
    leadInput({
      person: { name: "Other", phone: "+919876500001" },
      trip: { destination: { kind: "new", name: "Manali" } },
    }),
  );
  const customer = newCustomerNumber();
  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        name: "Rahul Mehta",
        text: "Hi, Manali jana hai 15 se 20 Dec, 4 log, 1 lakh tak",
      }),
    ]),
  ).toBe(200);

  // The worker scores the chat a few seconds after the message, and fills the lead's empty fields in the same call.
  await expect(async () => {
    await owner.goto("/leads");
    await owner
      .getByRole("link", { name: /Rahul Mehta/ })
      .first()
      .click({ timeout: 4_000 });
    await expect(owner.locator("[data-ai-suggested]")).toBeVisible({ timeout: 6_000 });
  }).toPass({ timeout: 150_000 });
  await expect(owner.getByText("The AI filled in from the customer's messages")).toBeVisible();
  expect(await owner.locator("[data-ai-suggested]").getByRole("button", { name: "Confirm" }).count()).toBe(1);
  await expectAccessible(owner);
  await shoot(owner, testInfo, "lead-suggested-fields");

  await owner.locator("[data-ai-suggested]").getByRole("button", { name: "Confirm" }).click();
  await expect(owner.locator("[data-ai-suggested]")).toHaveCount(0);
  // What the AI wrote stays, as the lead's own.
  await expect(owner.getByText("Manali").first()).toBeVisible();
  const [entry] = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.lead-fields-confirmed" } }),
  );
  expect(entry?.after).toMatchObject({ fields: expect.arrayContaining(["destination", "adults"]) });
});
