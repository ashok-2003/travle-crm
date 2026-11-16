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
