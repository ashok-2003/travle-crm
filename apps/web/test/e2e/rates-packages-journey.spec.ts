// Rates, priced quote lines and packages (release 7b): a supplier's rates by season, a quote line priced from a rate with the
// minimum-margin warning that warns and never blocks, what a salesperson sees of costs, and a package with two tiers made into
// quotes for a lead, one with a line that needs a rate. Each on a phone and a desktop.
import { inputDay } from "./support/departures";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import {
  callApi,
  dayInIndia,
  leadWorkerAgency,
  addLeadThroughApi,
  leadInput,
  anotherPersonsDevice,
} from "./support/leads";
import {
  aDraftQuote,
  aLeadFor,
  aPackage,
  aRate,
  aSeason,
  aSupplier,
  aTier,
  saveMarginSettings,
  updatePackage,
} from "./support/packages";

// A step that cannot find its target fails in seconds and says which, not at the end of the test's time.
test.use({ actionTimeout: 15_000 });

test("a supplier's rates by season: two seasons, an overlap refused, and a season copied to next year with a rise", async ({
  page,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  const supplierId = await aSupplier(page);
  await page.goto(`/suppliers/${supplierId}`);
  const rates = page.getByRole("region", { name: "Rates" });
  await expect(rates).toContainText("No seasons yet");

  // The first season, with a rate.
  await rates.getByRole("button", { name: "Add a season" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Peak 2027");
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(dayInIndia(20)));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(dayInIndia(60)));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(rates.getByRole("heading", { level: 3, name: "Peak 2027" })).toBeVisible();
  await rates.getByRole("button", { name: "Add a rate" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item", { exact: true }).fill("Deluxe room");
  await dialog.getByRole("combobox", { name: "Meal plan" }).click();
  await page.getByRole("option", { name: /^MAP/ }).click();
  await dialog.getByRole("combobox", { name: "Occupancy" }).click();
  await page.getByRole("option", { name: "Double" }).click();
  await dialog.getByLabel("Cost to the agency").fill("3500");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(rates).toContainText("Deluxe room");
  await expect(rates).toContainText("₹3,500");

  // A season that overlaps it is refused in words.
  await rates.getByRole("button", { name: "Add a season" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Clash");
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(dayInIndia(50)));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(dayInIndia(70)));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Another season of this supplier already covers some of these dates.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(dayInIndia(61)));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(dayInIndia(120)));
  await dialog.getByLabel("Name", { exact: true }).fill("Monsoon 2027");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(rates.getByRole("heading", { level: 3, name: "Monsoon 2027" })).toBeVisible();
  await rates.getByRole("button", { name: "Add a rate" }).nth(1).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item", { exact: true }).fill("Deluxe room");
  await dialog.getByLabel("Cost to the agency").fill("2,800");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(rates).toContainText("₹2,800");

  // Peak copied to next year, every cost up by 10 %: ₹3,850, rounded to a rupee.
  await rates.getByRole("button", { name: "Copy Peak 2027 to other dates" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name of the new season")).toHaveValue("Peak 2028");
  await dialog.getByLabel("Change every cost by (%)").fill("10");
  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(rates.getByRole("heading", { level: 3, name: "Peak 2028" })).toBeVisible();
  await expect(rates).toContainText("₹3,850");
  await expect(rates).toContainText("₹3,500");
});

test("a quote line priced from a rate carries its cost, a thin margin warns and the quote still sends", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const supplierId = await aSupplier(page);
  const seasonId = await aSeason(page, supplierId, { label: "Peak 2027", from: 1, to: 100 });
  await aRate(page, seasonId, { costRupees: 3500 });
  // A 10 % markup on cost, and a 12 % least margin: a line priced from the rate earns 9.09 %.
  await saveMarginSettings(page, { markupBasisPoints: 1000, minMarginBasisPoints: 1200 });
  const leadId = await aLeadFor(page);
  const quoteId = await aDraftQuote(page, leadId, { startInDays: 10 });

  await page.goto(`/quotes/${quoteId}`);
  await page.getByRole("button", { name: "Price from rate" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").filter({ hasText: "No supplier chosen" }).click();
  await page.getByPlaceholder("Search suppliers").fill("Aurora");
  await page.getByRole("option", { name: "Hotel Aurora" }).click();
  await dialog.getByRole("combobox").filter({ hasText: "Choose a rate" }).click();
  await page.getByRole("option", { name: /Deluxe room/ }).click();
  await dialog.getByLabel("How many").fill("8");
  await dialog.getByRole("button", { name: "Add the line" }).click();
  await expect(page.getByText("Line added")).toBeVisible();
  // The cost is copied in, and the price is cost plus the markup.
  await expect(page.getByLabel("Price of one")).toHaveValue("3,850");
  await expect(page.getByText("Cost ₹3,500 each")).toBeVisible();
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();

  // The warning, with figures for whoever may see margins; and the margin on its own card.
  await expect(page.getByText("Below the agency's minimum margin", { exact: true })).toBeVisible();
  await expect(page.getByText(/This quote earns 9\.09% \(₹2,800\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Margin" })).toBeVisible();

  // It warns and never blocks: Send anyway goes on to the customer's link.
  await page.getByRole("button", { name: "Customer link" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Send below the minimum margin?");
  await page.getByRole("button", { name: "Send anyway" }).click();
  await expect(page.getByLabel("The customer's link")).toBeVisible();
  const sent = await callApi<{ status: string }>(page, "quotes.get", { quoteId });
  expect(sent.status).toBe("sent");
});

test("a salesperson reads the warning in words, sees no cost, and a save keeps the costs on the lines", async ({
  page,
  browser,
  agency,
  addStaff,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const supplierId = await aSupplier(page);
  const seasonId = await aSeason(page, supplierId, { label: "Peak 2027", from: 1, to: 100 });
  const rateId = await aRate(page, seasonId, { costRupees: 3500 });
  await saveMarginSettings(page, { markupBasisPoints: 0, minMarginBasisPoints: 1200 });
  const leadId = await addLeadThroughApi(
    page,
    leadInput({ ownerUserId: ravi.userId, person: { name: "Meera Iyer", phone: "+919876500402" } }),
  );
  const quoteId = await aDraftQuote(page, leadId, { startInDays: 10 });
  const priced = await callApi<Record<string, unknown>>(page, "quotes.priceLine", {
    rateId,
    date: dayInIndia(10),
    quantity: 8,
  });
  const owned = await callApi<{ title: string }>(page, "quotes.get", { quoteId });
  await callApi(page, "quotes.update", {
    quoteId,
    title: owned.title,
    startDate: dayInIndia(10),
    adults: 4,
    children: 0,
    days: [],
    items: [priced],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 0,
    placeOfSupply: null,
  });

  const sales = await anotherPersonsDevice(browser);
  const salesPage = await sales.newPage();
  await signInByCode(salesPage, { code: agency.code, staff: ravi });
  await salesPage.goto(`/quotes/${quoteId}`);
  await expect(salesPage.getByText("Below the agency's minimum margin, check with your manager.")).toBeVisible();
  await expect(salesPage.getByText(/₹2,800|9\.09/)).toHaveCount(0);
  await expect(salesPage.getByText(/Cost ₹/)).toHaveCount(0);
  await expect(salesPage.getByRole("button", { name: "Price from rate" })).toHaveCount(0);
  const seen = await callApi<{ items: Record<string, unknown>[]; margin: { marginPaise: number | null } }>(
    salesPage,
    "quotes.get",
    { quoteId },
  );
  expect(seen.items[0]).not.toHaveProperty("costUnitPaise");
  expect(seen.items[0]).not.toHaveProperty("rateId");
  expect(seen.margin.marginPaise).toBeNull();

  // The salesperson saves a change to the title: the cost stays on the line, so the Owner still sees the margin.
  await salesPage.getByLabel("Quote title").fill("Kedarnath for four, revised");
  await salesPage.getByRole("button", { name: "Save quote" }).click();
  await expect(salesPage.getByText("Quote saved")).toBeVisible();
  const owner = await callApi<{ items: { costUnitPaise?: number }[]; margin: { marginPaise: number | null } }>(
    page,
    "quotes.get",
    { quoteId },
  );
  expect(owner.items[0]?.costUnitPaise).toBe(350_000);
  expect(owner.margin.marginPaise).toBe(0);
  await sales.close();
});

test("a package with two tiers makes a quote for each, and a date with no rate makes a line that needs one", async ({
  page,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const supplierId = await aSupplier(page);
  const seasonId = await aSeason(page, supplierId, { label: "Peak 2027", from: 1, to: 100 });
  const deluxe = await aRate(page, seasonId, { item: "Deluxe room", costRupees: 3500 });
  const suite = await aRate(page, seasonId, { item: "Suite", costRupees: 6000 });
  await saveMarginSettings(page, { markupBasisPoints: 0, minMarginBasisPoints: null });
  const packageId = await aPackage(page);
  await updatePackage(page, packageId, { nights: 5 });

  // The Standard tier is written on the package's page: a hotel line from a rate, and a cab at a fixed price.
  await page.goto(`/packages/${packageId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Kedarnath yatra" })).toBeVisible();
  await page.getByRole("button", { name: "Add a tier" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Standard");
  await dialog.getByLabel("What it is").first().fill("Hotel in Guptkashi");
  await dialog.getByRole("combobox", { name: "How many a quote gets" }).click();
  await page.getByRole("option", { name: /room night/ }).click();
  await dialog.getByRole("radio", { name: "A supplier's rate" }).check();
  await dialog.getByRole("combobox").filter({ hasText: "No supplier chosen" }).click();
  await page.getByPlaceholder("Search suppliers").fill("Aurora");
  await page.getByRole("option", { name: "Hotel Aurora" }).click();
  await dialog.getByRole("combobox").filter({ hasText: "Choose a rate" }).click();
  await page.getByRole("option", { name: /Deluxe room/ }).click();
  await dialog.getByRole("button", { name: "Add a line" }).click();
  await dialog.getByLabel("What it is").nth(1).fill("Cab, Dehradun to Kedarnath");
  await dialog.getByRole("combobox", { name: "How many a quote gets" }).nth(1).click();
  await page.getByRole("option", { name: "A fixed number" }).click();
  await dialog.getByLabel("Price of one").fill("18,000");
  await dialog.getByRole("button", { name: "Save tier" }).click();
  await expect(page.getByRole("region", { name: "Tiers" })).toContainText("Standard");
  await expect(page.getByRole("region", { name: "Tiers" })).toContainText("2 lines");

  // Deluxe, through the api: the suite instead of the deluxe room.
  await aTier(page, packageId, "Deluxe", [
    { description: "Hotel in Guptkashi", rateId: suite, quantityRule: "per_room_night" },
    { description: "Cab, Dehradun to Kedarnath", rateId: null, quantityRule: "fixed", priceRupees: 18_000 },
  ]);
  expect(deluxe).not.toBe(suite);

  // Both tiers become quotes for the lead, priced from the season that covers the start date.
  const leadId = await aLeadFor(page);
  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "New quote" }).click();
  await page.getByRole("menuitem", { name: "Kedarnath yatra" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: "Standard" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Deluxe" })).toBeChecked();
  await dialog.getByRole("textbox", { name: "Travel from" }).fill(inputDay(dayInIndia(10)));
  await dialog.getByRole("button", { name: "Make the quotes" }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Kedarnath yatra (Standard)" })).toBeVisible();
  // Two adults need one room, five nights: 5 room nights at ₹3,500.
  await expect(page.getByLabel("How many").first()).toHaveValue("5");
  await expect(page.getByLabel("Price of one").first()).toHaveValue("3,500");
  await expect(page.getByLabel("Price of one").nth(1)).toHaveValue("18,000");
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("link", { name: "Kedarnath yatra (Deluxe)" })).toBeVisible();

  // A start date outside every season: the hotel line is at zero and needs a rate; the quote can't go until it is priced.
  await page.getByRole("button", { name: "New quote" }).click();
  await page.getByRole("menuitem", { name: "Kedarnath yatra" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Deluxe" }).uncheck();
  await dialog.getByRole("textbox", { name: "Travel from" }).fill(inputDay(dayInIndia(400)));
  await dialog.getByRole("button", { name: "Make the quotes" }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 line needs a rate")).toBeVisible();
  await expect(page.getByText("Needs a rate", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customer link" })).toBeDisabled();
  // Typing a price settles it.
  await page.getByLabel("Price of one").first().fill("4,000");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();
  await expect(page.getByText("1 line needs a rate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Customer link" })).toBeEnabled();
});
