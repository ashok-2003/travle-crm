// Bookings from first acceptance to cancellation (release 6): a quote the customer accepts becomes a booking the agency
// confirms; the traveller says "I've paid" and staff check it; the trip page, hotel vouchers and the itinerary PDF; the traveller
// fills their own details; and a booking cancelled with a charge and a refund. Each on a phone and on a desktop.
import { saveBusinessProfile } from "./support/documents";
import { acceptedQuote } from "./support/bookings";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi } from "./support/leads";

test("a customer accepts a quote, a booking waits on Today, and one tap confirms it with the default schedule", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { bookingId } = await acceptedQuote(page, browser);

  // The task to confirm it is on Today, leading to the booking.
  await page.goto("/today");
  await expect(page.getByText(/Confirm booking BK-\d{4}-\d{4} for Rahul Sharma/)).toBeVisible();

  // The list says it waits for the agency; the booking says why.
  await page.goto("/bookings");
  const row = page.getByRole("row", { name: /Rahul Sharma/ });
  await expect(row).toContainText("Waiting for you");
  await page.getByRole("link", { name: "Rahul Sharma" }).click();
  await expect(page).toHaveURL(new RegExp(`/bookings/${bookingId}$`));
  await expect(page.getByText("Waiting for you to confirm")).toBeVisible();

  // One tap: the agency's default schedule (30% now, the rest 15 days before) is offered and made with the confirmation.
  await page.getByRole("button", { name: "Confirm booking" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Payment 1: name")).toHaveValue("Advance");
  await expect(dialog.getByLabel("Payment 2: name")).toHaveValue("Balance");
  await expect(dialog.getByText("₹1,00,000 of ₹1,00,000")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  const money = page.getByRole("region", { name: "Money" });
  await expect(money).toContainText("Advance");
  await expect(money).toContainText("Balance");
  await expect(money).toContainText("₹30,000");
  // The traveller agreed to trip updates when accepting; reminders are made.
  await expect(page.getByText("The traveller agreed to trip updates on WhatsApp.")).toBeVisible();
});

test("the traveller says they paid, staff check it on Today and confirm it, and the page says Received", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { bookingId, link } = await acceptedQuote(page, browser, { name: "Meera Iyer", phone: "+919876500002" });
  await callApi(page, "bookings.confirm", { bookingId });

  const customer = await browser.newPage();
  await customer.goto(link);
  await expect(customer.getByText("Next payment ₹30,000.00")).toBeVisible();
  await customer.getByText("I've paid Advance").click();
  await customer.getByLabel("UPI reference or transaction number").first().fill("UTR778899");
  await customer.getByRole("button", { name: "I've paid" }).first().click();
  await expect(customer.getByText("Thank you, we'll check your payment")).toBeVisible();
  await expect(customer.getByText("Payment being verified").first()).toBeVisible();

  // Staff see a Check payment task, open the booking, and confirm: one payment on the quote.
  await page.goto("/today");
  await expect(page.getByText(/Check payment of ₹30,000.00 from Meera Iyer/)).toBeVisible();
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByText("UPI reference UTR778899")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record the payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.getByRole("region", { name: "Money" })).toContainText("Received");
  await expect(page.getByRole("region", { name: "Money" })).toContainText("UPI");

  await customer.reload();
  await expect(customer.getByText("Received").first()).toBeVisible();
  await expect(customer.getByText("Next payment ₹70,000.00")).toBeVisible();
  await customer.close();
});

test("staff fill the trip, issue a voucher and the itinerary PDF, and the traveller's page shows them", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { bookingId, link } = await acceptedQuote(page, browser, { name: "Kabir Anand", phone: "+919876500003" });
  await callApi(page, "bookings.confirm", { bookingId });
  await page.goto(`/bookings/${bookingId}`);

  await page.getByRole("button", { name: "Edit essentials" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reporting time").fill("06:30");
  await dialog.getByLabel("Reporting place").fill("Hotel lobby, Manali");
  await dialog.getByLabel("Driver or guide", { exact: true }).fill("Dorje");
  await dialog.getByLabel("Driver or guide phone").fill("+919800000002");
  await dialog.getByRole("button", { name: "Save essentials" }).click();
  await expect(page.getByText("Essentials saved")).toBeVisible();

  await page.getByRole("button", { name: "Add a stay" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hotel").fill("Hotel Snow Lion");
  await dialog.getByLabel("Address").fill("Kaza, Spiti");
  await dialog.getByRole("textbox", { name: "Check-in" }).fill("01/01/2027");
  await dialog.getByRole("textbox", { name: "Check-out" }).fill("03/01/2027");
  await dialog.getByLabel("Room and meal notes").fill("Double room with breakfast");
  await dialog.getByRole("button", { name: "Save stay" }).click();
  await expect(page.getByText("Stay saved")).toBeVisible();

  // The voucher is numbered and rendered by the worker; the tab it opens is closed here.
  let popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Issue voucher" }).click();
  await (await popup).close();
  await expect(page.getByText(/VCH-\d{4}-\d{4}/)).toBeVisible();
  popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Prepare the trip PDF" }).click();
  await (await popup).close();
  await expect(page.getByText(/ITN-\d{4}-\d{4}/)).toBeVisible();

  const customer = await browser.newPage();
  await customer.goto(link);
  await expect(customer.getByText("Hotel Snow Lion")).toBeVisible();
  await expect(customer.getByRole("link", { name: "Hotel voucher" })).toBeVisible();
  await expect(customer.getByRole("link", { name: "Download trip PDF" })).toBeVisible();
  await expect(customer.getByText("Report at 06:30, Hotel lobby, Manali")).toBeVisible();
  await expect(customer.getByText("Dorje")).toBeVisible();
  // The voucher is a PDF.
  const voucherPath = (await customer.getByRole("link", { name: "Hotel voucher" }).getAttribute("href")) ?? "";
  await expect
    .poll(async () => (await customer.request.get(voucherPath, { maxRedirects: 0 })).status(), { timeout: 30_000 })
    .toBe(302);
  await customer.close();

  // Changing the stay shows its voucher as out of date, to issue again.
  await page.getByRole("button", { name: "Edit Hotel Snow Lion" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Check-out" }).fill("04/01/2027");
  await dialog.getByRole("button", { name: "Save stay" }).click();
  await expect(page.getByText("Voucher is out of date, issue again")).toBeVisible();
});

test("the traveller fills their own details and never sees an ID number again", async ({ page, browser, agency }) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { bookingId, link } = await acceptedQuote(page, browser, { name: "Tara Menon", phone: "+919876500004" });
  await callApi(page, "bookings.confirm", { bookingId });
  await callApi(page, "bookings.setLevel", { bookingId, level: "international" });

  const customer = await browser.newPage();
  await customer.goto(link);
  await expect(customer.getByText("0 of 2 complete")).toBeVisible();
  const form = customer.locator("form", { has: customer.locator('input[name="traveller"]') }).first();
  await form.getByLabel("Name as on ID").fill("Tara Menon");
  await form.getByLabel("Date of birth").fill("1990-04-02");
  await form.getByLabel("Emergency contact name").fill("Arun Menon");
  await form.getByLabel("Emergency contact phone").fill("+919800000005");
  await form.getByLabel("Passport number").fill("P7654321");
  await form.getByLabel("Passport issued on").fill("2020-01-01");
  await form.getByLabel("Passport expires on").fill("2030-01-01");
  await form.getByLabel("Nationality").fill("Indian");
  await form.getByRole("button", { name: "Save details" }).click();
  await expect(customer.getByText("Thank you, your details are saved")).toBeVisible();
  await expect(customer.getByText("1 of 2 complete")).toBeVisible();
  await expect(customer.getByText("Details received ✓")).toBeVisible();
  expect(await customer.content()).not.toContain("P7654321");
  await customer.close();

  // Staff see the progress, and the number only with documents:view_sensitive.
  await page.goto(`/bookings/${bookingId}`);
  const travellers = page.getByRole("region", { name: "Travellers" });
  await expect(travellers).toContainText("1 of 2 complete");
  await expect(travellers).toContainText("ID on file");
  expect(await page.content()).not.toContain("P7654321");
});

test("a booking is cancelled with the policy's charge, the refund is marked paid, and the page shows a plain notice", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { bookingId, quoteId, link } = await acceptedQuote(page, browser, {
    name: "Dev Patel",
    phone: "+919876500005",
  });
  await callApi(page, "bookings.confirm", { bookingId });
  await callApi(page, "quotes.recordPayment", {
    quoteId,
    amountPaise: 3_000_000,
    receivedOn: new Date().toISOString().slice(0, 10),
    method: "bank",
    reference: "NEFT1",
    requestId: crypto.randomUUID(),
  });

  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Why it is cancelled").fill("Family emergency");
  // 40 days out: the 30-days-or-more step, 10% of ₹1,00,000, so ₹10,000 kept and ₹20,000 back.
  await expect(dialog.getByText("10% of the trip total")).toBeVisible();
  await expect(dialog.getByLabel("Cancellation charge")).toHaveValue("10,000");
  await expect(dialog.getByText("₹20,000").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText(/The cancellation charge is ₹10,000/)).toBeVisible();

  // The refund is a task for the owner, paid outside the product and marked paid.
  await page.getByRole("button", { name: "Mark refunded" }).click();
  await page.getByRole("dialog").getByLabel("Reference").fill("NEFT-REFUND-1");
  await page.getByRole("dialog").getByRole("button", { name: "Mark refunded" }).click();
  await expect(page.getByText("Refund marked paid")).toBeVisible();
  await expect(page.getByRole("region", { name: "Money" })).toContainText("Refunded");

  const customer = await browser.newPage();
  await customer.goto(link);
  await expect(customer.getByText(/This booking was cancelled on/)).toBeVisible();
  await expect(customer.getByText("Cancellation terms")).toBeVisible();
  await expect(customer.getByText("Next payment")).toHaveCount(0);
  await customer.close();
});
