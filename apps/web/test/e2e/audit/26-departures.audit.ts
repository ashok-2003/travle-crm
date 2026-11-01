// The visual audit of release 7a (2026-10-30): the departures list, a departure with its seats, holds and waitlist, the
// rooming list, Today's departures, a supplier and what the agency owes.
import { aDeparture, aLead, bookedOn } from "../support/departures";
import { acceptedQuote } from "../support/bookings";
import { saveBusinessProfile } from "../support/documents";
import { expect, signInByEmail, test } from "../support/fixtures";
import { callApi, dayInIndia } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("departures, the rooming list, suppliers and dues", async ({ page, browser, agency }) => {
  test.setTimeout(480_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);

  const kedarnath = await aDeparture(page, {
    title: "Kedarnath yatra",
    startInDays: 6,
    nights: 5,
    seats: 20,
    priceRupees: 12_500,
  });
  const spiti = await aDeparture(page, { title: "Spiti winter batch", startInDays: 40, nights: 6, seats: 2 });
  await aDeparture(page, { title: "Ladakh summer batch", startInDays: 120, nights: 8, seats: 14 });
  await bookedOn(page, browser, kedarnath, { name: "Priya Nair", phone: "+919876500301", adults: 3 });
  await bookedOn(page, browser, kedarnath, { name: "Arjun Mehta", phone: "+919876500302", adults: 2 });
  const holder = await aLead(page, "Sneha Kulkarni", "+919876500303");
  await callApi(page, "departures.hold", { departureId: kedarnath, leadId: holder, seats: 4, hours: 3, note: "" });
  await bookedOn(page, browser, spiti, { name: "Asha Rao", phone: "+919876500304", adults: 2 });
  const waiting = await aLead(page, "Dev Malhotra", "+919876500305");
  await callApi(page, "departures.addToWaitlist", { departureId: spiti, leadId: waiting, seats: 2 });

  await page.goto("/departures");
  await expect(page.getByRole("link", { name: "Kedarnath yatra" })).toBeVisible();
  await shoot(page, "r7a-departures");

  await page.goto(`/departures/${kedarnath}`);
  await expect(page.getByRole("region", { name: "Held seats" })).toContainText("Sneha Kulkarni");
  await shoot(page, "r7a-departure");

  await page.goto(`/departures/${spiti}`);
  await expect(page.getByRole("region", { name: "Waitlist" })).toContainText("Dev Malhotra");
  await shoot(page, "r7a-holds-waitlist");

  await callApi(page, "departures.rooming.saveStay", {
    departureId: kedarnath,
    hotelName: "Hotel Himalaya, Guptkashi",
    supplierId: null,
    checkIn: dayInIndia(6),
    checkOut: dayInIndia(8),
  });
  const rooming = await callApi<{ stays: { id: string }[] }>(page, "departures.rooming.get", {
    departureId: kedarnath,
  });
  const stayId = rooming.stays[0]?.id ?? "";
  await callApi(page, "departures.rooming.draft", { stayId });
  await page.goto(`/departures/${kedarnath}`);
  await page.getByRole("tab", { name: "Rooming" }).click();
  await expect(page.getByRole("region", { name: "Hotel Himalaya, Guptkashi" })).toContainText("Room 1");
  await shoot(page, "r7a-rooming");

  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Departures leaving soon" })).toContainText("Kedarnath yatra");
  await shoot(page, "r7a-today");

  const booked = await acceptedQuote(page, browser, { name: "Rahul Sharma", phone: "+919876500306" });
  await callApi(page, "bookings.confirm", { bookingId: booked.bookingId });
  const supplier = await callApi<{ id: string }>(page, "suppliers.create", {
    kind: "hotel",
    name: "Hotel Himalaya",
    city: "Guptkashi",
    gstin: "",
    paymentTerms: "50% advance, the rest on check-out",
    paymentDetails: "UPI himalaya@okbank",
    notes: "",
  });
  await callApi(page, "suppliers.saveContact", {
    supplierId: supplier.id,
    name: "Dorje Lama",
    role: "Manager",
    phone: "+919800000401",
    whatsapp: "",
    email: "",
  });
  await callApi(page, "finance.addCost", {
    quoteId: booked.quoteId,
    departureId: null,
    supplierId: supplier.id,
    category: "hotel",
    supplier: "Hotel Himalaya",
    amountPaise: 4_500_000,
    dueOn: dayInIndia(-2),
    paidOn: null,
    note: "",
  });
  await callApi(page, "finance.addCost", {
    quoteId: null,
    departureId: kedarnath,
    supplierId: supplier.id,
    category: "transport",
    supplier: "Hotel Himalaya",
    amountPaise: 6_000_000,
    dueOn: dayInIndia(2),
    paidOn: null,
    note: "Bus for the batch",
  });
  await callApi(page, "finance.addCost", {
    quoteId: null,
    departureId: kedarnath,
    supplierId: null,
    category: "guide",
    supplier: "Tenzin guide service",
    amountPaise: 1_800_000,
    dueOn: dayInIndia(5),
    paidOn: null,
    note: "",
  });
  await page.goto(`/suppliers/${supplier.id}`);
  await expect(page.getByRole("region", { name: "Costs" })).toContainText("₹45,000");
  await shoot(page, "r7a-supplier");

  await page.goto("/suppliers/dues");
  await expect(page.getByRole("region", { name: "Hotel Himalaya" })).toContainText("Overdue");
  await shoot(page, "r7a-dues");
});
