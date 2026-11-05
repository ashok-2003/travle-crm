// A group package from its seasons to a quote (group packages): the Owner makes "Manali 5N6D" a group trip with room types,
// days, seats, GST and an advance, prices two seasons, sees the departures made for it, adds a brochure and a payment QR,
// lets the AI sell it, and a quote for three in a triple room on the first season's departure totals ₹20,997.00.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi, dayInIndia } from "./support/leads";
import { aLeadFor, aPackage } from "./support/packages";
import { saveBusinessProfile } from "./support/documents";

test.use({ actionTimeout: 15_000 });

/** A one-pixel picture, which storage takes as a brochure or a QR. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const inputDay = (day: string): string => day.split("-").reverse().join("/");

test("an Owner makes a group package, prices its seasons, sees its departures and files, lets the AI sell it, and quotes three in a triple room", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const packageId = await aPackage(page, "Manali 5N6D");

  await page.goto(`/packages/${packageId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Manali 5N6D" })).toBeVisible();
  await expectAccessible(page);

  // The kind, the rooms, the days, the seats, the GST and the advance.
  await page.getByRole("radio", { name: "A group trip that departs on set dates" }).check();
  await page.getByRole("button", { name: "Triple", exact: true }).click();
  await page.getByRole("button", { name: "Double", exact: true }).click();
  await page.getByRole("button", { name: "Fri", exact: true }).click();
  await page.getByRole("button", { name: "Sat", exact: true }).click();
  await page.getByLabel("Nights", { exact: true }).fill("5");
  await page.getByLabel("Seats on each departure").fill("20");
  await page.getByLabel("Starts from").fill("Delhi");
  await page.getByLabel("Advance to hold a seat (each person)").fill("2,000");
  await page.getByRole("switch", { name: "Prices include GST" }).check();
  await page.getByLabel("How to pay").fill("UPI manali@agency");
  await page.getByLabel("Pickup points").fill("Kashmere Gate\nMajnu ka Tilla");
  await page.getByRole("button", { name: "Save package" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  // The first season covers the next five weeks and the second the weeks after: the departures fall in both.
  const first = { label: "Nov", from: dayInIndia(1), to: dayInIndia(35) };
  const second = { label: "Dec to Jan peak", from: dayInIndia(36), to: dayInIndia(120) };
  const seasons = page.getByRole("region", { name: "Seasons and room prices" });
  await expect(seasons).toContainText("No seasons yet");
  await seasons.getByRole("button", { name: "Add a season" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(first.label);
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(first.from));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(first.to));
  await dialog.getByLabel("Triple, per person").fill("6,999");
  await dialog.getByLabel("Double, per person").fill("7,799");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(seasons).toContainText("Nov");
  await seasons.getByRole("button", { name: "Add a season" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(second.label);
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(second.from));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(second.to));
  await dialog.getByLabel("Triple, per person").fill("8,999");
  await dialog.getByLabel("Double, per person").fill("9,999");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(seasons).toContainText("Dec to Jan peak");
  await expect(seasons).toContainText("Triple: ₹6,999");

  // The departures made when the package was saved.
  const departuresCard = page.getByRole("region", { name: "Departures" });
  await expect(departuresCard.getByRole("link", { name: "Manali 5N6D" }).first()).toBeVisible();
  await expect(departuresCard).toContainText("20 of 20");

  // A brochure and a payment QR go straight to storage.
  const files = page.getByRole("region", { name: "Brochures and payment QR" });
  await page
    .getByTestId("package-brochure-input")
    .setInputFiles({ name: "manali.png", mimeType: "image/png", buffer: PIXEL });
  await expect(files.getByRole("link", { name: "manali.png" })).toBeVisible();
  await page
    .getByTestId("package-qr-input")
    .setInputFiles({ name: "pay-qr.png", mimeType: "image/png", buffer: PIXEL });
  await expect(files.getByRole("link", { name: "pay-qr.png" })).toBeVisible();

  // Everything the AI needs is there, so it may be turned on.
  const sell = page.getByRole("switch", { name: "AI can sell this package" });
  await expect(sell).toBeEnabled();
  await sell.click();
  await expect(page.getByText("The AI can sell this package")).toBeVisible();
  await expect(sell).toBeChecked();
  await expectAccessible(page);

  // A quote for a lead, three in a triple room on the first departure of the first season.
  const departures = await callApi<{ id: string; startDate: string; endDate: string; seatsTotal: number }[]>(
    page,
    "departures.list",
    { filter: "upcoming", templateId: packageId },
  );
  // Twelve weeks of Fridays and Saturdays is far under the list's limit of 100, so nothing is cut off.
  expect(departures.length).toBeGreaterThan(0);
  expect(departures.length).toBeLessThan(100);
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  for (const one of departures) {
    const start = new Date(`${one.startDate}T00:00:00Z`);
    expect([5, 6], `${one.startDate} is not a Friday or a Saturday`).toContain(start.getUTCDay());
    expect(one.seatsTotal).toBe(20);
    expect((new Date(`${one.endDate}T00:00:00Z`).getTime() - start.getTime()) / dayMilliseconds).toBe(5);
  }
  const inSeason = (season: { from: string; to: string }) =>
    departures.filter((one) => one.startDate >= season.from && one.startDate <= season.to);
  expect(inSeason(first).length).toBeGreaterThan(0);
  expect(inSeason(second).length).toBeGreaterThan(0);
  const departure = departures.find((one) => one.startDate >= first.from && one.startDate <= first.to);
  if (departure === undefined) throw new Error("no departure fell in the first season");
  const leadId = await aLeadFor(page, "Priya Nair", "+919876500611");
  const quote = await callApi<{ id: string }>(page, "packages.makeGroupQuote", {
    leadId,
    packageId,
    departureId: departure.id,
    rooms: [{ roomType: "triple", people: 3 }],
  });
  await page.goto(`/quotes/${quote.id}`);
  // The screen shows whole rupees; the quote holds 2099700 paise, ₹20,997.00.
  await expect(page.getByText("₹20,997", { exact: true }).first()).toBeVisible();
  const made = await callApi<{ totals: { totalPaise: number } }>(page, "quotes.get", { quoteId: quote.id });
  expect(made.totals.totalPaise).toBe(2_099_700);
  await expectAccessible(page);
});
