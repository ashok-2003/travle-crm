// The quote write-up and "ask your reports" (release ai2b), on a phone and a desktop, against the real api and worker with the
// fake AI (support/fake-openrouter.ts: it answers one scripted message, and one report per question). The AI proposes, a person
// decides:
// - a quote is written up in Hindi, then English: the total and advance are the quote's own, a price the model typed is taken
//   out, a draft quote has no link, Copy works, and "Put in the chat box" fills the box (a person presses send; the send is audited);
// - a question about Instagram leads is answered by the sources report with "I understood this as", and the range can change;
// - a question no report answers is declined with three suggestions.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { skipAccessibilityCheck } from "./support/accessible-after-each";
import { expect, signInToConsole, test } from "./support/console";
import { saveBusinessProfile } from "./support/documents";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";
import { connectNumber, inAgency, newCustomerNumber, openNewChat, sentTo } from "./support/whatsapp";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai2b1");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";
const fakeOpenRouter = () => process.env.E2E_AI_URL ?? "";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(shots, `${testInfo.project.name}-${name}.png`) });
  if (before !== null) await page.setViewportSize(before);
}

const turnOnAi = (page: Page, writeStyle: "warm" | "premium" | "short" = "warm") =>
  callApi(page, "ai.saveSettings", { enabled: true, scoring: true, writeStyle, instructions: "" });

/** What the fake AI was sent by the feature whose rules start with `marker`. */
async function requestsOf(marker: string): Promise<string[]> {
  const all = (await (await fetch(`${fakeOpenRouter()}/_requests`)).json()) as {
    body: { messages: { content: unknown }[] };
  }[];
  return all
    .filter((one) => JSON.stringify(one.body.messages[0]?.content).includes(marker))
    .map((one) => JSON.stringify(one.body.messages));
}

test("a quote is written up for the customer in Hindi and English, and goes to the chat box for a person to send", async ({
  page,
  browser,
  superAdmin,
  agency,
}, testInfo) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await (await browser.newContext()).newPage();
  await owner.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInByEmail(owner, agency.owner);
  await saveBusinessProfile(owner);
  await turnOnAi(owner, "premium");
  const customer = newCustomerNumber();
  await openNewChat(owner, business, customer, "Rahul Mehta", "Hi, Manali trip for 2 please");
  // The lead of this customer's chat (the number's own test message made another).
  const leadId = await inAgency(agency.organizationId, async (tx) => {
    const chat = await tx.whatsappConversation.findFirstOrThrow({
      where: { phoneE164: { endsWith: customer.slice(-10) } },
    });
    return (await tx.lead.findFirstOrThrow({ where: { personId: chat.personId ?? "" } })).id;
  });

  // A draft quote of ₹20,000 plus 5% GST: ₹21,000 in two payments, the advance ₹10,000 first.
  const quote = await callApi<{ id: string }>(owner, "quotes.create", {
    leadId,
    title: "Manali for two",
    startDate: "2027-12-15",
    adults: 2,
    children: 0,
    days: [
      { title: "Arrive in Manali", description: "Pick-up from Chandigarh" },
      { title: "Solang Valley", description: "Snow activities" },
    ],
    items: [{ description: "Package per adult", detail: "", quantity: 2, unitPricePaise: 1_000_000 }],
    inclusions: "Breakfast and transfers",
    exclusions: "Flights",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
  });
  await callApi(owner, "quotes.addInstallment", {
    quoteId: quote.id,
    label: "Advance",
    amountPaise: 1_000_000,
    dueOn: "2027-11-01",
  });
  await callApi(owner, "quotes.addInstallment", {
    quoteId: quote.id,
    label: "Balance",
    amountPaise: 1_100_000,
    dueOn: "2027-12-01",
  });

  // Hindi, for WhatsApp, on a draft: the total and advance are the quote's, the typed price is gone, and a draft has no link.
  await owner.goto(`/quotes/${quote.id}`);
  await owner.getByRole("button", { name: "Write for the customer" }).click();
  const sheet = owner.getByRole("dialog", { name: "Write for the customer" });
  await sheet.getByRole("radio", { name: "Hindi" }).click();
  await shoot(owner, testInfo, "writeup-choices");
  await sheet.getByRole("button", { name: "Write it" }).click();
  const text = sheet.getByLabel("The message");
  await expect(text).toHaveValue(/नमस्ते Rahul जी/);
  await expect(text).toHaveValue(/₹21,000\.00/);
  await expect(text).toHaveValue(/₹10,000\.00/);
  expect(await text.inputValue()).not.toContain("55,555");
  expect(await text.inputValue()).not.toContain("{link}");
  expect(await text.inputValue()).not.toContain("क्वोट");
  await expect(sheet.getByText(/typed an amount of its own/)).toBeVisible();
  await expectAccessible(owner);
  await shoot(owner, testInfo, "writeup-sheet-hindi");

  // Copy puts it on the clipboard.
  await sheet.getByRole("button", { name: "Copy" }).click();
  await expect(owner.getByText("Copied")).toBeVisible();
  expect(await owner.evaluate(() => navigator.clipboard.readText())).toContain("₹21,000.00");
  const [hindi] = await requestsOf("WRITE_UP.");
  expect(hindi).toContain("Language: Hindi");
  expect(hindi).toContain("Polished and refined");
  // The model was never shown a unit price.
  expect(hindi).not.toMatch(/10,000|1000000|1,000,000/);
  expect(hindi).toContain("Solang Valley");
  await owner.keyboard.press("Escape");

  // Once the customer has the link (a sent quote), the write-up carries it, and "Put in the chat box" fills the reply box.
  await owner.getByRole("button", { name: "Customer link" }).click();
  const link = await owner.getByLabel("The customer's link").inputValue();
  await owner.getByRole("button", { name: "Write for the customer" }).click();
  await sheet.getByRole("radio", { name: "English" }).click();
  await sheet.getByRole("button", { name: "Write it" }).click();
  await expect(text).toHaveValue(new RegExp(`See the full quote: ${link.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
  await expect(text).toHaveValue(/Hi Rahul! Your Manali plan is ready\./);
  await shoot(owner, testInfo, "writeup-sheet-english");
  await sheet.getByRole("button", { name: "Put in the chat box" }).click();
  const chat = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  const box = chat.getByRole("combobox", { name: "Message" });
  await expect(box).toHaveValue(/Advance to book: ₹10,000\.00/);
  await expect(chat.getByText("Drafted by AI")).toBeVisible();
  // Nothing was sent by itself.
  expect(await sentTo(customer)).toHaveLength(0);

  // A person presses send; the send is audited as drafted by AI.
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(box).toHaveValue("");
  await expect(async () => {
    const sent = await sentTo(customer);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain(link);
    expect(sent[0]?.text).not.toContain("55,555");
  }).toPass({ timeout: 60_000 });
  const entries = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.draft-sent" } }),
  );
  expect(entries).toHaveLength(1);
});

test("the write-up's style is chosen once in Settings, AI", async ({ page, agency }) => {
  // The autopilot and voice sections of this screen (not this change) have select buttons with no name, which axe reports.
  skipAccessibilityCheck(
    "Settings, AI: the autopilot's select buttons have no accessible name (not part of the write-up)",
  );
  await signInByEmail(page, agency.owner);
  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { level: 1, name: "AI sales agent" })).toBeVisible();
  await page.getByRole("radio", { name: "Short and to the point" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("AI settings saved")).toBeVisible();
  const row = await inAgency(agency.organizationId, (tx) => tx.aiSettings.findFirstOrThrow());
  expect(row.writeStyle).toBe("short");
});

test("a question is answered by the right report, with its range changed, and one no report answers is declined", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Secret Customer", phone: "+919811122233" }, source: "instagram" }),
  );
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Other Person", phone: "+919811122244" }, source: "website" }),
  );

  await page.goto("/reports");
  await page.getByLabel("Your question").fill("How many leads came from Instagram last month?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  // Understood as the sources report, last month: nothing arrived last month, so the range is changed to this month.
  await expect(page.getByText("I understood this as:")).toBeVisible();
  await expect(page.getByText("Leads by source, last month")).toBeVisible();
  await expect(page.getByText("Nothing in this report for that period.")).toBeVisible();
  await page.getByRole("radio", { name: "this month", exact: true }).click();
  await expect(page.getByText("Leads by source, this month")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Instagram" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Website" })).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "ask-answer");

  // What the AI was sent: the question and the catalogue, and none of the agency's data.
  const [sent] = (await requestsOf("ASK_REPORT.")).slice(-1);
  expect(sent).toContain("How many leads came from Instagram last month?");
  expect(sent).toContain("leads_by_source");
  expect(sent).not.toMatch(/Secret Customer|9811122233|Other Person/);

  // A question the reports can't answer: declined, with the three nearest questions they can.
  await page.getByLabel("Your question").fill("What will the weather be in Manali next week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("I can't answer that one")).toBeVisible();
  await expect(page.getByRole("button", { name: "Why do we lose leads?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How many quotes were sent and accepted?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How did we do overall?" })).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "ask-declined");
  await page.getByRole("button", { name: "Why do we lose leads?" }).click();
  await expect(page.getByText("Lost leads by reason")).toBeVisible();
});
