// Group departures from the first batch to the rooming list (release 7a): a batch made with seats, seats held for a lead and
// the quote started from the hold, the booking that takes them and the seats left, the waitlist when it is full, the rooms
// drafted and sent to a hotel, a cost of the whole batch in its profit, and the batch on Today. Each on a phone and a desktop.
import { aDeparture, aLead, bookedOn, inputDay } from "./support/departures";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi, dayInIndia } from "./support/leads";

test("an Owner adds a batch with seats, holds some for a lead, and the quote made from the hold becomes a booking that takes them", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await aLead(page, "Priya Nair", "+919876500101");

  await page.goto("/departures");
  await page.getByRole("button", { name: "New departure" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Kedarnath yatra, 3 Nov");
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(dayInIndia(20)));
  await dialog.getByRole("textbox", { name: "Last day", exact: true }).fill(inputDay(dayInIndia(25)));
  await dialog.getByLabel("Seats", { exact: true }).fill("20");
  await dialog.getByLabel("Price per person (before GST)").fill("12,500");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kedarnath yatra, 3 Nov" })).toBeVisible();
  const seats = page.locator("dl").first();
  await expect(seats).toContainText("20");
  await expect(page.getByText("Open", { exact: true })).toBeVisible();

  // Three seats held for a lead, for six hours: the seats left fall to 17.
  await page.getByRole("button", { name: "Hold seats" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByPlaceholder("Search by name or phone").fill("Priya");
  await page.getByRole("option", { name: /Priya Nair/ }).click();
  await dialog.getByLabel("Seats", { exact: true }).fill("3");
  await dialog.getByLabel("Hold for (hours)").fill("6");
  await dialog.getByRole("button", { name: "Hold seats" }).click();
  await expect(page.getByText("Seats held")).toBeVisible();
  const holds = page.getByRole("region", { name: "Held seats" });
  await expect(holds).toContainText("Priya Nair");
  await expect(holds).toContainText("3 seats");
  await expect(page.locator("dl").first()).toContainText("17");

  // Asking for more than are free is refused in words.
  await page.getByRole("button", { name: "Hold seats" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByPlaceholder("Search by name or phone").fill("Priya");
  await page.getByRole("option", { name: /Priya Nair/ }).click();
  await dialog.getByLabel("Seats", { exact: true }).fill("30");
  await dialog.getByRole("button", { name: "Hold seats" }).click();
  await expect(dialog.getByText(/already holds seats|aren't that many seats/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // "Make quote" starts a draft on the departure, with its dates and the seats held.
  await holds.getByRole("button", { name: "Make a quote for Priya Nair" }).click();
  await expect(page).toHaveURL(/\/quotes\//);
  await expect(page.getByRole("region", { name: "Departure" })).toContainText("On Kedarnath yatra, 3 Nov");
  const quoteId = new URL(page.url()).pathname.split("/").pop() ?? "";
  const shared = await callApi<{ path: string }>(page, "quotes.share", { quoteId });
  const customer = await browser.newPage();
  await customer.goto(`${new URL(page.url()).origin}${shared.path}`);
  await customer.getByLabel("Your name").fill("Priya Nair");
  await customer.getByLabel(/I agree to the terms/).check();
  await customer.getByLabel("Send me trip updates on WhatsApp").check();
  await customer.getByRole("button", { name: "Accept quote" }).click();
  await expect(customer.getByText("Thank you, your acceptance is recorded")).toBeVisible();
  await customer.close();

  // The booking takes the seats: sold 3, held 0, 17 free, and the hold is gone.
  await expect
    .poll(async () => (await callApi<{ items: unknown[] }>(page, "bookings.list", {})).items.length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  await page.goto("/departures");
  await expect(page.getByRole("row", { name: /Kedarnath yatra/ })).toContainText("3 sold, 0 held");
  await page.getByRole("link", { name: "Kedarnath yatra, 3 Nov" }).click();
  await expect(page.getByRole("region", { name: "Bookings" })).toContainText("Priya Nair");
  await expect(page.getByRole("region", { name: "Held seats" })).toContainText("No seats are held.");
});

test("a full batch takes a lead on its waitlist, and a quote accepted on it goes over the seats, shown as overbooked", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const departureId = await aDeparture(page, { title: "Spiti batch", seats: 2 });
  await bookedOn(page, browser, departureId, { name: "Asha Rao", phone: "+919876500102", adults: 2 });
  await aLead(page, "Dev Malhotra", "+919876500103");

  await page.goto(`/departures/${departureId}`);
  await expect(page.getByText("Full", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to waitlist" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByPlaceholder("Search by name or phone").fill("Dev");
  await page.getByRole("option", { name: /Dev Malhotra/ }).click();
  await dialog.getByLabel("Seats", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Added to the waitlist")).toBeVisible();
  await expect(page.getByRole("region", { name: "Waitlist" })).toContainText("Dev Malhotra");

  // Another traveller accepts anyway: the booking stands and the batch reads overbooked.
  await bookedOn(page, browser, departureId, { name: "Ivan Roy", phone: "+919876500104", adults: 1 });
  await page.reload();
  await expect(page.getByText("Overbooked by 1")).toBeVisible();
  await page.goto("/today");
  await expect(page.getByText(/Overbooked by 1: Spiti batch/)).toBeVisible();
});

test("the rooms are drafted for a hotel, a traveller is moved by hand, and the list goes out as a file", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const departureId = await aDeparture(page, { title: "Chardham batch", seats: 10 });
  await bookedOn(page, browser, departureId, { name: "Meena Kapoor", phone: "+919876500105", adults: 3 });

  await page.goto(`/departures/${departureId}`);
  await page.getByRole("tab", { name: "Rooming" }).click();
  await page.getByRole("button", { name: "Add a stay" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hotel", { exact: true }).fill("Hotel Himalaya");
  await dialog.getByRole("textbox", { name: "Check-in" }).fill(inputDay(dayInIndia(10)));
  await dialog.getByRole("textbox", { name: "Check-out" }).fill(inputDay(dayInIndia(12)));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Stay saved")).toBeVisible();

  await page.getByRole("button", { name: "Draft rooms" }).click();
  await expect(page.getByText("Rooms drafted")).toBeVisible();
  const stay = page.getByRole("region", { name: "Hotel Himalaya" });
  await expect(stay).toContainText("Room 1");
  await expect(stay).toContainText("Room 2");
  await expect(stay.getByText("Everyone has a room.")).toBeVisible();

  // A hand-placed traveller is kept in place; the file for the hotel downloads.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel file for Hotel Himalaya" }).click();
  expect((await download).suggestedFilename()).toMatch(/^rooming-hotel-himalaya-.*\.csv$/);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Rooming list PDF for Hotel Himalaya" }).click();
  await (await popup).close();
  await expect(stay).toContainText("Up to date");
});

test("a cost of the whole batch is in its profit, and the batch is on Today with what needs a look", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const departureId = await aDeparture(page, { title: "Leh batch", seats: 6, startInDays: 4 });
  await bookedOn(page, browser, departureId, { name: "Nisha Bose", phone: "+919876500106", adults: 2 });

  await page.goto("/today");
  const section = page.getByRole("region", { name: "Departures leaving soon" });
  await expect(section).toContainText("Leh batch");
  await expect(section).toContainText("2 of 6 seats sold");
  await expect(section).toContainText("Details missing");

  await page.goto(`/departures/${departureId}`);
  await page.getByRole("tab", { name: "Costs" }).click();
  await page.getByRole("button", { name: "Add a departure cost" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Supplier's name").fill("Hotel block, Leh");
  await dialog.getByLabel("Amount").fill("5,000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Cost added")).toBeVisible();
  const costs = page.getByRole("region", { name: "Costs and profit" });
  await expect(costs).toContainText("Hotel block, Leh");
  await expect(costs).toContainText("₹5,000");
  await expect(costs).toContainText("₹20,000");
  await expect(costs).toContainText("₹15,000");
});
