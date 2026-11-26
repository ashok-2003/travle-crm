// The visual audit of release 7b (2026-11-02): a supplier's rates in two seasons, a quote with lines priced from rates and the
// minimum-margin warning, a package with two tiers, a package's public page and its enquiry form (joining a departure).
import { saveBusinessProfile } from "../support/documents";
import { expect, signInByEmail, test } from "../support/fixtures";
import { ownDeparture } from "../support/departures";
import { callApi, dayInIndia } from "../support/leads";
import {
  aDestination,
  aDraftQuote,
  aLeadFor,
  aPackage,
  aRate,
  aSeason,
  aSupplier,
  aTier,
  publishedPackage,
  saveMarginSettings,
  updatePackage,
} from "../support/packages";
import { visitorsDevice } from "../support/website-form";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("rates, a priced quote with the warning, a package with tiers, and its public page", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(480_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);

  const supplierId = await aSupplier(page, "Hotel Aurora");
  const peak = await aSeason(page, supplierId, { label: "Peak 2027", from: 1, to: 100 });
  const monsoon = await aSeason(page, supplierId, { label: "Monsoon 2027", from: 101, to: 200 });
  const deluxe = await aRate(page, peak, { item: "Deluxe room", costRupees: 3500 });
  const suite = await aRate(page, peak, { item: "Suite", costRupees: 6000 });
  await aRate(page, monsoon, { item: "Deluxe room", costRupees: 2800 });
  await aRate(page, monsoon, { item: "Suite", costRupees: 4800 });
  await page.goto(`/suppliers/${supplierId}`);
  await expect(page.getByRole("region", { name: "Rates" })).toContainText("Monsoon 2027");
  await shoot(page, "r7b-rates");

  // A quote with two lines priced from rates and a thin margin.
  await saveMarginSettings(page, { markupBasisPoints: 1000, minMarginBasisPoints: 1200 });
  const leadId = await aLeadFor(page);
  const quoteId = await aDraftQuote(page, leadId, { startInDays: 10 });
  const hotel = await callApi<Record<string, unknown>>(page, "quotes.priceLine", {
    rateId: deluxe,
    date: dayInIndia(10),
    quantity: 8,
  });
  const upgrade = await callApi<Record<string, unknown>>(page, "quotes.priceLine", {
    rateId: suite,
    date: dayInIndia(10),
    quantity: 2,
  });
  await callApi(page, "quotes.update", {
    quoteId,
    title: "Kedarnath for four",
    startDate: dayInIndia(10),
    adults: 4,
    children: 0,
    days: [{ title: "Arrive in Guptkashi", description: "Check in and rest." }],
    items: [
      hotel,
      upgrade,
      { description: "Cab, Dehradun to Kedarnath", detail: "", quantity: 1, unitPricePaise: 1_800_000 },
    ],
    inclusions: "Hotel, breakfast and dinner",
    exclusions: "Lunch",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
  });
  await page.goto(`/quotes/${quoteId}`);
  await expect(page.getByText("Below the agency's minimum margin", { exact: true })).toBeVisible();
  await shoot(page, "r7b-quote-margin");

  // A package with a Standard and a Deluxe tier, photos and a page.
  const destinationId = await aDestination(page, "Kedarnath");
  const packageId = await aPackage(page);
  await aTier(page, packageId, "Standard", [
    { description: "Hotel in Guptkashi", rateId: deluxe, quantityRule: "per_room_night" },
    { description: "Cab, Dehradun to Kedarnath", rateId: null, quantityRule: "fixed", priceRupees: 18_000 },
  ]);
  await aTier(page, packageId, "Deluxe", [
    { description: "Hotel in Guptkashi", rateId: suite, quantityRule: "per_room_night" },
    { description: "Cab, Dehradun to Kedarnath", rateId: null, quantityRule: "fixed", priceRupees: 18_000 },
  ]);
  const address = await publishedPackage(
    page,
    packageId,
    { slug: "kedarnath-yatra", destinationId, priceRupees: 32_000 },
    agency.code,
  );
  await page.goto(`/packages/${packageId}`);
  await expect(page.getByRole("region", { name: "Tiers" })).toContainText("Deluxe");
  await expect(page.getByRole("region", { name: "Public page" })).toContainText("Published");
  await shoot(page, "r7b-package");

  // The public page on this device, and the enquiry form with a departure being joined.
  for (const [title, start, seats] of [
    ["Kedarnath yatra, 3 Nov", 20, 20],
    ["Kedarnath yatra, 9 Nov", 30, 1],
  ] as const) {
    await callApi(page, "departures.create", {
      title,
      destinationId,
      startDate: dayInIndia(start),
      endDate: dayInIndia(start + 5),
      seatsTotal: seats,
      pricePaise: 3_200_000,
      cutoffOn: null,
      notes: "",
      ...ownDeparture,
    });
  }
  const visitor = await visitorsDevice(browser);
  const visit = await visitor.newPage();
  await visit.goto(address);
  await expect(visit.getByRole("heading", { level: 1, name: "Kedarnath yatra" })).toBeVisible();
  await shoot(visit, "r7b-public-page");
  await visit
    .getByRole("button", { name: /^Join the departure on/ })
    .first()
    .click();
  await expect(visit.getByRole("heading", { name: /^Join the departure on/ })).toBeVisible();
  await shoot(visit, "r7b-public-form");
  await visitor.close();
});

test("a group trip with two seasons: its departures calendar, and the Packages list", async ({ page, agency }) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const packageId = await aPackage(page, "Spiti 6N7D");
  await updatePackage(page, packageId, {
    kind: "group",
    roomTypes: ["triple", "double"],
    weeklyDays: [5, 6, 0],
    seatsPerDeparture: 20,
    nights: 6,
    startCity: "Delhi",
  });
  // The first days have no season (their departures say "No price"), then Regular, then a dear Festival fortnight.
  const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
  await callApi(page, "packages.saveSeason", {
    packageId,
    label: "Regular",
    startsOn: dayInIndia(6),
    endsOn: dayInIndia(20),
    prices: { ...none, triple: 1_230_000, double: 1_399_900 },
  });
  await callApi(page, "packages.saveSeason", {
    packageId,
    label: "Festival",
    startsOn: dayInIndia(21),
    endsOn: dayInIndia(120),
    prices: { ...none, triple: 1_899_900, double: 2_099_900 },
  });
  // A cancelled, a full and a nearly full departure among the weekly ones.
  const days = await callApi<{ departureId: string; seatsFree: number }[]>(page, "departures.calendar", {
    packageId,
    from: dayInIndia(0),
    to: dayInIndia(30),
  });
  const [cancelled, full, few] = days.slice(2, 5);
  if (cancelled === undefined || full === undefined || few === undefined) throw new Error("no weekly departures made");
  await callApi(page, "departures.cancel", { departureId: cancelled.departureId, reason: "Road closed" });
  await callApi(page, "departures.setSeats", { departureId: full.departureId, seatsTotal: 0 });
  await callApi(page, "departures.setSeats", { departureId: few.departureId, seatsTotal: 3 });

  await page.goto(`/packages/${packageId}`);
  const card = page.getByRole("region", { name: "Departures", exact: true });
  await expect(card.getByRole("list", { name: "Seasons" })).toContainText("Festival");
  await expect(card.getByRole("button", { name: /departure/ }).first()).toBeVisible();
  await shoot(page, "packages-group-trip", { element: card });
  if (test.info().project.name === "phone") {
    // A phone shows one month: the next one has the seasons' colours. Then the narrowest phone, where nothing may spill.
    await card.getByRole("button", { name: "Next month" }).click();
    await expect(card.getByRole("button", { name: /^4 Dec, departure/ })).toBeVisible();
    await shoot(page, "packages-group-trip-next", { element: card });
    await page.setViewportSize({ width: 360, height: 800 });
    await shoot(page, "packages-group-trip-360", { element: card });
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.goto("/packages");
  await expect(page.getByText("Spiti 6N7D").first()).toBeVisible();
  await shoot(page, "packages-group-list");
});
