// An agency's public package pages (release 7b): a published package at /a/<sign-in code>/<package> with its photos, plan and
// price, the enquiry that arrives as a lead, joining a departure (and the waitlist of a full one) as a lead with a task, and
// the plain page for one that is not there. Nothing private is on the page: no cost, supplier or seat count.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { ownDeparture } from "./support/departures";
import { callApi, dayInIndia } from "./support/leads";
import {
  aDestination,
  aLeadFor,
  aPackage,
  aRate,
  aSeason,
  aSupplier,
  aTier,
  publishedPackage,
} from "./support/packages";
import { fillVisitor, leadsOfPhone, newPhone, timelineOf, visitorsDevice } from "./support/website-form";

// A step that cannot find its target fails in seconds and says which, not at the end of the test's time.
test.use({ actionTimeout: 15_000 });

/** The two seconds a person needs to fill a form: an enquiry sent sooner after the page was made is refused as too fast. */
const fillTime = (page: { waitForTimeout: (milliseconds: number) => Promise<void> }) => page.waitForTimeout(2_200);

async function aDeparture(
  page: Parameters<typeof callApi>[0],
  destinationId: string,
  title: string,
  seats: number,
  start: number,
) {
  const { id } = await callApi<{ id: string }>(page, "departures.create", {
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
  return id;
}

test("a visitor reads a published package and the enquiry arrives as a lead; a page that is not there is plain", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  // A cost, a supplier and a tier behind the package, none of which may reach the page.
  const supplierId = await aSupplier(page, "Hotel Aurora");
  const seasonId = await aSeason(page, supplierId, { label: "Peak 2027", from: 1, to: 100 });
  const rateId = await aRate(page, seasonId, { costRupees: 3500 });
  const packageId = await aPackage(page);
  await aTier(page, packageId, "Standard", [
    { description: "Hotel in Guptkashi", rateId, quantityRule: "per_room_night" },
  ]);
  const address = await publishedPackage(
    page,
    packageId,
    { slug: "kedarnath-yatra", priceRupees: 32_000 },
    agency.code,
  );

  const visitor = await visitorsDevice(browser);
  const visit = await visitor.newPage();
  const response = await visit.goto(address);
  expect(response?.status()).toBe(200);
  await expect(visit.getByRole("heading", { level: 1, name: "Kedarnath yatra" })).toBeVisible();
  await expect(visit.getByText("From ₹32,000 per person")).toBeVisible();
  await expect(visit.getByText("5 nights")).toBeVisible();
  await expect(visit.getByText("Darshan at Kedarnath")).toBeVisible();
  await expect(visit.getByText("Free to cancel 30 days before.")).toBeVisible();
  await expect(visit.getByText("A family agency in Dehradun, running yatras since 2009.")).toBeVisible();
  await expectAccessible(visit);
  // The page holds what the agency published and nothing it paid or keeps.
  const html = await visit.content();
  for (const secret of ["Hotel Aurora", "3500", "350000", "costUnitPaise", "seatsTotal"]) {
    expect(html, secret).not.toContain(secret);
  }
  await expect(visit.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(visit.locator('meta[property="og:title"]')).toHaveAttribute("content", /Kedarnath yatra/);

  // The enquiry.
  await fillTime(visit);
  const phone = newPhone();
  await fillVisitor(visit, { name: "Meera Pillai", phone });
  await visit.getByLabel("How many travellers").fill("3");
  await visit.getByLabel("Anything we should know (optional)").fill("Can we have a vegetarian cook?");
  await visit.getByRole("button", { name: "Send enquiry" }).click();
  await expect(visit.getByText("Thank you!")).toBeVisible();
  await expect(visit.getByText("Sharma Travels will get in touch with you soon.")).toBeVisible();

  const leads = await leadsOfPhone(page, phone);
  expect(leads).toHaveLength(1);
  const lead = leads[0];
  if (lead === undefined) throw new Error("no lead");
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText("Package page").first()).toBeVisible();
  const timeline = JSON.stringify(await timelineOf(page, lead.id));
  expect(timeline).toContain("Enquired about Kedarnath yatra");
  expect(timeline).toContain("Can we have a vegetarian cook?");

  // The agency's all-packages page lists it; a page that is not there is plain, with a 404.
  const list = await visitor.newPage();
  await list.goto(`/a/${agency.code.toLowerCase()}`);
  await expect(list.getByRole("heading", { level: 1, name: "Our packages" })).toBeVisible();
  await expect(list.getByRole("link", { name: /See the package/ })).toBeVisible();
  await expectAccessible(list);
  await list.getByLabel("Search packages").fill("zzzz");
  await expect(list.getByText("No package matches.")).toBeVisible();
  const missing = await visitor.newPage();
  const gone = await missing.goto(`/a/${agency.code.toLowerCase()}/no-such-trip`);
  expect(gone?.status()).toBe(404);
  await expect(missing.getByRole("heading", { level: 1, name: "This page isn't available" })).toBeVisible();

  // Taken down, the package's own page is the same plain 404.
  await callApi(page, "packages.setPublished", { packageId, published: false });
  const down = await visitor.newPage();
  expect((await down.goto(address))?.status()).toBe(404);
  await visitor.close();
});

test("a visitor joins an open departure and a full one's waitlist, each landing as a lead with a task", async ({
  page,
  browser,
  agency,
}) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  const destinationId = await aDestination(page, "Kedarnath");
  const packageId = await aPackage(page);
  const address = await publishedPackage(
    page,
    packageId,
    { slug: "kedarnath-yatra", destinationId, priceRupees: 32_000 },
    agency.code,
  );
  const openId = await aDeparture(page, destinationId, "Kedarnath yatra, 3 Nov", 20, 20);
  const fullId = await aDeparture(page, destinationId, "Kedarnath yatra, 9 Nov", 1, 30);
  const holder = await aLeadFor(page, "Priya Nair", "+919876500403");
  await callApi(page, "departures.hold", { departureId: fullId, leadId: holder, seats: 1, hours: 3, note: "" });
  expect(openId).not.toBe(fullId);

  const visitor = await visitorsDevice(browser);
  const visit = await visitor.newPage();
  await visit.goto(address);
  // Dates and words, never seat counts.
  const departures = visit.getByRole("region", { name: "Departures" });
  await expect(departures).toContainText("Open");
  await expect(departures).toContainText("Full");
  await expect(departures).not.toContainText(/\b20 seats|\b1 seat/);

  // Joining the open one: the date is fixed and the form asks for seats.
  await fillTime(visit);
  await visit.getByRole("button", { name: /^Join the departure on/ }).click();
  await expect(visit.getByRole("heading", { name: /^Join the departure on/ })).toBeVisible();
  await expectAccessible(visit);
  const phone = newPhone();
  await fillVisitor(visit, { name: "Dev Malhotra", phone });
  await visit.getByLabel("How many seats").fill("2");
  await visit.getByRole("button", { name: "Send request" }).click();
  await expect(visit.getByText("Thank you!")).toBeVisible();
  const leads = await leadsOfPhone(page, phone);
  expect(leads).toHaveLength(1);
  const joined = leads[0];
  if (joined === undefined) throw new Error("no lead");
  await page.goto(`/leads/${joined.id}`);
  await expect(
    page.getByText(/Hold seats or make a quote: Dev Malhotra, 2 seats on Kedarnath yatra, 3 Nov/),
  ).toBeVisible();

  // The full one says waitlist, and its task says to add the lead to it.
  await visit.reload();
  await fillTime(visit);
  await visit.getByRole("button", { name: /^Join the waitlist for/ }).click();
  await expect(visit.getByRole("heading", { name: /^Join the waitlist for/ })).toBeVisible();
  const waiting = newPhone();
  await fillVisitor(visit, { name: "Asha Rao", phone: waiting });
  await visit.getByLabel("How many seats").fill("1");
  await visit.getByRole("button", { name: "Join the waitlist", exact: true }).click();
  await expect(visit.getByText("Thank you!")).toBeVisible();
  const second = (await leadsOfPhone(page, waiting))[0];
  if (second === undefined) throw new Error("no lead");
  await page.goto(`/leads/${second.id}`);
  await expect(page.getByText(/Add to the waitlist: Asha Rao, 1 seat on Kedarnath yatra, 9 Nov/)).toBeVisible();
  await visitor.close();
});
