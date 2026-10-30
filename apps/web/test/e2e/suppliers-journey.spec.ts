// Suppliers and what the agency owes (release 7a): a supplier kept with its contact, a booking's cost typed with its name and
// linked to it in one tap, a cost of a whole departure added to a supplier made on the spot, and the dues grouped by
// supplier with the overdue first. Each on a phone and a desktop.
import { acceptedQuote } from "./support/bookings";
import { aDeparture, inputDay } from "./support/departures";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi, dayInIndia } from "./support/leads";

test("a supplier with a contact, a typed cost linked to it, and the dues by supplier with the overdue first", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { quoteId, bookingId } = await acceptedQuote(page, browser, { name: "Rahul Sharma", phone: "+919876500201" });
  await callApi(page, "bookings.confirm", { bookingId });
  await callApi(page, "finance.addCost", {
    quoteId,
    departureId: null,
    supplierId: null,
    category: "hotel",
    supplier: "dolma lodge",
    amountPaise: 3_000_000,
    dueOn: dayInIndia(-3),
    paidOn: null,
    note: "",
  });

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "New supplier" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Dolma Lodge");
  await dialog.getByLabel("City").fill("Kaza");
  await dialog.getByLabel("Bank or UPI details").fill("UPI dolma@okbank");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dolma Lodge" })).toBeVisible();

  await page.getByRole("button", { name: "Add a contact" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Dorje");
  await dialog.getByLabel("Role").fill("Manager");
  await dialog.getByLabel("Phone", { exact: true }).fill("+919800000301");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Contact saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Dorje" })).toBeVisible();

  // The cost typed as "dolma lodge" is linked in one tap, and then counts as owed to the supplier.
  // A toast stops while the pointer is over it: move off, and let it go before reaching for what lies under it.
  await page.mouse.move(0, 0);
  await expect(page.getByText("Contact saved")).toBeHidden({ timeout: 15_000 });
  // Centred first: on a phone the bottom bar and a toast sit over the foot of the page.
  const link = page.getByRole("button", { name: "Link 1 cost named like this one" });
  await link.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await link.click();
  await expect(page.getByText("1 cost linked")).toBeVisible();
  await expect(page.getByRole("region", { name: "Costs" })).toContainText("₹30,000");

  await page.goto("/suppliers/dues");
  const group = page.getByRole("region", { name: "Dolma Lodge" });
  await expect(group).toContainText("Owed ₹30,000");
  await expect(group).toContainText("Overdue");
  const markPaid = group.getByRole("button", { name: /Mark the cost for Dolma Lodge paid/ });
  await markPaid.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await markPaid.click();
  await expect(page.getByText("You owe nobody anything.")).toBeVisible();
});

test("a cost of a whole departure can add a supplier on the spot, and the supplier page shows it", async ({
  page,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  const departureId = await aDeparture(page, { title: "Ladakh batch", seats: 12 });
  await page.goto(`/departures/${departureId}`);
  await page.getByRole("tab", { name: "Costs" }).click();
  await page.getByRole("button", { name: "Add a departure cost" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByPlaceholder("Search suppliers").fill("Leh Cabs");
  await page.getByRole("option", { name: /Add "Leh Cabs"/ }).click();
  await expect(page.getByText("Leh Cabs added to your suppliers")).toBeVisible();
  await dialog.getByLabel("Amount").fill("42,000");
  await dialog.getByRole("textbox", { name: "Due by" }).fill(inputDay(dayInIndia(1)));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Cost added")).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("link", { name: "Leh Cabs" }).click();
  await expect(page.getByRole("region", { name: "Costs" })).toContainText("₹42,000");
  await expect(page.getByRole("region", { name: "Costs" })).toContainText("Ladakh batch");
});
