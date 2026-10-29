// A quote from first line to invoice (the owner's decisions of 2026-10-28): an Owner makes a quote on a lead, shares its link,
// the customer accepts on the link, the Owner records a payment and issues the invoice; a quote that was sent is read only;
// and a salesperson can write quotes but can neither record a payment nor open the money in the reports.
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, signInByCode, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput, leadWorkerAgency } from "./support/leads";

test("an Owner quotes, the customer accepts on the link, the Owner records a payment and issues the invoice", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const leadId = await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919876543210" } }));

  // A blank quote from the lead's page, with one priced line.
  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "New quote" }).click();
  await page.getByRole("menuitem", { name: "Blank quote" }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Quote title").fill("Goa for four");
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("What", { exact: true }).fill("Package per adult");
  await page.getByLabel("Price of one").fill("12,000");
  await page.getByLabel("How many").fill("4");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();

  // Its link, which the customer opens without signing in.
  await page.getByRole("button", { name: "Customer link" }).click();
  const link = await page.getByLabel("The customer's link").inputValue();
  expect(link).toMatch(/\/p\/.+/);
  const customer = await browser.newPage();
  await customer.goto(link);
  await expect(customer.getByRole("heading", { level: 1, name: "Goa for four" })).toBeVisible();
  await expect(customer.getByText("₹50,400.00").first()).toBeVisible();
  await customer.getByLabel("Your name").fill("Rahul Sharma");
  await customer.getByLabel(/I agree to the terms/).check();
  await customer.getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Thank you, your acceptance is recorded")).toBeVisible();
  await customer.close();

  // The quote is accepted and, being sent, can no longer be changed.
  await page.reload();
  await expect(
    page.getByText(/Rahul Sharma accepted this on .*\. It is now the booking, so its prices can't change\./),
  ).toBeVisible();
  // Read as text, with nothing to type in, add or delete.
  await expect(page.getByLabel("Quote title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a line" })).toHaveCount(0);
  await expect(page.getByText("4 × ₹12,000")).toBeVisible();

  // A payment, recorded once, moves what is left.
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("20,000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.getByText("₹30,400", { exact: true })).toBeVisible();
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByText("Won", { exact: true }).first()).toBeVisible();

  // The tax invoice, numbered once the worker has made it.
  await page.goBack();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Make tax invoice" }).click();
  await (await popup).close();
  await expect(page.getByRole("button", { name: "Tax invoice", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("a salesperson writes quotes but can't record a payment or open the money in the reports", async ({
  page,
  browser,
  agency,
  addStaff,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const leadId = await addLeadThroughApi(
    page,
    leadInput({ ownerUserId: ravi.userId, person: { name: "Meera Iyer", phone: "+919876500002" } }),
  );
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title: "Kerala",
    startDate: null,
    adults: 2,
    children: 0,
    days: [],
    items: [{ description: "Package", detail: "", quantity: 1, unitPricePaise: 1_000_000 }],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
  });
  await callApi(page, "quotes.share", { quoteId: quote.id });

  const salesperson = await browser.newPage();
  await signInByCode(salesperson, { code: agency.code, staff: ravi });
  await salesperson.goto(`/quotes/${quote.id}`);
  await expect(salesperson.getByRole("heading", { level: 1, name: "Kerala" })).toBeVisible();
  // They see the quote and can make a new version of it, but not record money on it.
  await expect(salesperson.getByRole("button", { name: "Make a new version" })).toBeVisible();
  await expect(salesperson.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  const refused = await salesperson.request.post("/api/trpc/quotes.recordPayment", {
    data: {
      quoteId: quote.id,
      amountPaise: 100_000,
      receivedOn: "2026-11-10",
      method: "upi",
      reference: "",
      requestId: crypto.randomUUID(),
    },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(refused.status()).toBe(403);

  // The reports open for them, with the leads' figures but no money.
  await salesperson.goto("/reports");
  await expect(salesperson.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(salesperson.getByText("New leads").first()).toBeVisible();
  await expect(salesperson.getByText("Money received")).toHaveCount(0);
  await expect(salesperson.getByRole("main").getByText("Sales", { exact: true })).toHaveCount(0);
});
