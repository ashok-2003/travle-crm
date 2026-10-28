// The visual audit of quotes, money and Suggest reply (2026-10-28): a draft quote, the customer's link, an accepted quote with
// its payments and tax invoice, Finance, Reports, Home's hot leads, the reason asked when a lead is lost, Settings, AI, and a
// chat's reply box holding the AI's draft. Everything is made through the api or by hand as a person would.
import { saveBusinessProfile } from "../support/documents";
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "../support/leads";
import { connectNumber, inAgency, newCustomerNumber, openNewChat } from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("quotes, payments, the invoice, Finance, Reports, hot leads and a lost reason", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(600_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const leadId = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Rahul Sharma", phone: "+919876543210" },
      trip: { adults: 4, budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "for_everyone" } },
    }),
  );
  const other = await addLeadThroughApi(page, leadInput({ person: { name: "Meera Iyer", phone: "+919876500002" } }));

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "New quote" }).click();
  await page.getByRole("menuitem", { name: "Blank quote" }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Quote title").fill("Goa for four, 5 nights");
  await page.getByRole("button", { name: "Add a day" }).click();
  await page.getByRole("textbox", { name: "Day 1" }).fill("Arrive in Goa, check in");
  await page.getByLabel("What happens").fill("Pick-up from the airport and a sunset at Baga.");
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("What", { exact: true }).fill("Package per adult");
  await page.getByLabel("Detail").fill("3-star hotel, breakfast, airport transfers");
  await page.getByLabel("Price of one").fill("12,000");
  await page.getByLabel("How many").fill("4");
  await shoot(page, "quote-editor");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();

  await page.getByRole("button", { name: "Customer link" }).click();
  const link = await page.getByLabel("The customer's link").inputValue();
  const customer = await browser.newPage();
  await customer.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await customer.goto(link);
  await expect(customer.getByRole("heading", { level: 1, name: "Goa for four, 5 nights" })).toBeVisible();
  await shoot(customer, "quote-customer-link");
  await customer.getByLabel("Your name").fill("Rahul Sharma");
  await customer.getByLabel(/I agree to the terms/).check();
  await customer.getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Thank you, your acceptance is recorded")).toBeVisible();
  await customer.close();

  await page.reload();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("dialog").getByLabel("Amount").fill("20,000");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await shoot(page, "quote-payments");

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Make tax invoice" }).click();
  await (await popup).close();
  await expect(page.getByRole("button", { name: "Tax invoice", exact: true })).toBeVisible({ timeout: 30_000 });
  await shoot(page, "quote-invoice");

  // What the booking cost, so Finance has a profit to show.
  const quoteId = page.url().split("/").pop() ?? "";
  await callApi(page, "finance.addCost", {
    quoteId,
    category: "hotel",
    supplier: "Hotel Baga Bliss",
    amountPaise: 3_200_000,
    dueOn: null,
    paidOn: null,
    note: "",
  });
  await page.goto("/finance");
  await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();
  await shoot(page, "finance");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await shoot(page, "reports");

  // Two leads the customers are deciding on, so Home has hot leads to call.
  await inAgency(agency.organizationId, async (tx) => {
    for (const hot of [leadId, other]) {
      await tx.leadSignal.createMany({
        data: [
          { leadId: hot, kind: "quote_opened", sourceKey: `open:${hot}:1`, at: new Date() },
          { leadId: hot, kind: "quote_opened", sourceKey: `open:${hot}:2`, at: new Date() },
        ],
      });
    }
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /hot lead/ })).toBeVisible();
  await shoot(page, "home-hot-leads");

  await page.goto(`/leads/${other}`);
  await page.getByRole("button", { name: "More for Meera Iyer" }).click();
  await page.getByRole("menuitem", { name: "Lost" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "lost-reason");
});

test("Settings, AI, and a chat's reply box with the AI's draft", async ({ page, browser, superAdmin, agency }) => {
  test.setTimeout(600_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await owner.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  await openNewChat(
    owner,
    business,
    customer,
    "Rahul Mehta",
    "Hi, do you have a Kerala package for 4 adults in December?",
  );

  await owner.goto("/settings/ai");
  await expect(owner.getByRole("heading", { level: 1, name: "AI" })).toBeVisible();
  await owner.getByLabel("Let the AI draft replies and guess how leads will go").click();
  await owner
    .getByLabel("Instructions for the AI")
    .fill(
      "Reply in Hinglish, warm and short. Always ask for the travel dates and the number of travellers. Never offer a discount.",
    );
  await shoot(owner, "settings-ai");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("AI settings saved")).toBeVisible();

  await owner.goto("/inbox");
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  const panel = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await panel.getByRole("button", { name: "Suggest reply" }).click();
  await expect(panel.getByText("Drafted by AI")).toBeVisible();
  await shoot(owner, "composer-suggestion");
});
