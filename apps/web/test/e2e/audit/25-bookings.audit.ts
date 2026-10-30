// The visual audit of release 6 (2026-10-29): the bookings list, a booking waiting for the agency and a confirmed one, the
// traveller's trip page with "I've paid" and a traveller's details form, the Check payment task on Today, a hotel voucher
// and the itinerary as PDFs (drawn as pictures, since a browser under test shows no PDF), a cancellation with its refund,
// and the settings.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveBusinessProfile } from "../support/documents";
import { acceptedQuote } from "../support/bookings";
import { expect, signInByEmail, test } from "../support/fixtures";
import { anotherPersonsDevice, callApi, dayInIndia } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

interface Detail {
  stays: { id: string; voucher: { documentId: string } | null }[];
  tripPdf: { documentId: string } | null;
  travellers: { id: string }[];
  claims: { id: string }[];
}

test("bookings, the trip page, the PDFs and a cancellation", async ({ page, browser, agency }) => {
  test.setTimeout(480_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);

  // Rahul has just accepted: the booking waits for the agency.
  const rahul = await acceptedQuote(page, browser, {
    name: "Rahul Sharma",
    phone: "+919876543210",
    title: "Spiti in winter",
    days: 40,
  });

  // Meera's is confirmed, with her trip filled in, a payment to check and a traveller's details to fill.
  const meera = await acceptedQuote(page, browser, {
    name: "Meera Iyer",
    phone: "+919876500002",
    title: "Kerala backwaters",
    totalRupees: 150_000,
    days: 8,
    adults: 3,
  });
  await callApi(page, "bookings.confirm", { bookingId: meera.bookingId });
  await callApi(page, "bookings.saveEssentials", {
    bookingId: meera.bookingId,
    reportingTime: "06:30",
    reportingPlace: "Cochin airport, arrivals gate 2",
    driverName: "Joseph",
    driverPhone: "+919847000001",
    emergencyName: "Sharma Travels office",
    emergencyPhone: "+919876543210",
  });
  const stay = await callApi<{ stayId: string }>(page, "bookings.saveStay", {
    bookingId: meera.bookingId,
    name: "Coconut Lagoon Resort",
    address: "Kumarakom, Kottayam",
    mapUrl: "https://maps.example.test/coconut-lagoon",
    checkIn: dayInIndia(8),
    checkOut: dayInIndia(11),
    notes: "Two double rooms, breakfast and dinner",
  });
  await callApi(page, "bookings.saveStay", {
    bookingId: meera.bookingId,
    name: "Lake Palace Houseboat",
    address: "Alleppey backwaters",
    mapUrl: "",
    checkIn: dayInIndia(11),
    checkOut: dayInIndia(12),
    notes: "One night on board, all meals",
  });
  const voucher = await callApi<{ documentId: string }>(page, "bookings.issueVoucher", { stayId: stay.stayId });
  const itinerary = await callApi<{ documentId: string }>(page, "bookings.prepareTripPdf", {
    bookingId: meera.bookingId,
  });
  const detail = await callApi<Detail>(page, "bookings.get", { bookingId: meera.bookingId });
  await callApi(page, "bookings.saveTraveller", {
    travellerId: detail.travellers[0]?.id,
    name: "Meera Iyer",
    dateOfBirth: "1988-06-14",
    gender: "female",
    phone: "+919876500002",
    emergencyName: "",
    emergencyPhone: "",
    medicalNotes: "",
    identity: null,
  });
  const traveller = await anotherPersonsDevice(browser);
  const customer = await traveller.newPage();
  await customer.goto(meera.link);
  await customer.getByText("I've paid Advance").click();
  await customer.getByLabel("UPI reference or transaction number").first().fill("UTR448802217");
  await customer.getByRole("button", { name: "I've paid" }).first().click();
  await expect(customer.getByText("Thank you, we'll check your payment")).toBeVisible();

  // Dev's was cancelled with 10% kept and a refund due.
  const dev = await acceptedQuote(page, browser, {
    name: "Dev Patel",
    phone: "+919876500005",
    title: "Rajasthan forts",
    days: 45,
  });
  await callApi(page, "bookings.confirm", { bookingId: dev.bookingId });
  await callApi(page, "quotes.recordPayment", {
    quoteId: dev.quoteId,
    amountPaise: 3_000_000,
    receivedOn: dayInIndia(0),
    method: "upi",
    reference: "UTR55100",
    requestId: crypto.randomUUID(),
  });
  await callApi(page, "bookings.cancel", { bookingId: dev.bookingId, reason: "Family emergency" });

  await page.goto("/bookings");
  await expect(page.getByRole("row", { name: /Meera Iyer/ })).toBeVisible();
  await shoot(page, "r6-bookings");

  await page.goto(`/bookings/${rahul.bookingId}`);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("dialog").getByLabel("Payment 2: name")).toHaveValue("Balance");
  await shoot(page, "r6-booking-requested");
  await page.keyboard.press("Escape");

  await page.goto(`/bookings/${meera.bookingId}`);
  await expect(page.getByRole("region", { name: "Money" })).toContainText("UTR448802217");
  await shoot(page, "r6-booking");
  await shoot(page, "r6-claim-check", { element: page.getByRole("region", { name: "Money" }) });

  await page.goto("/today");
  await expect(page.getByText(/Check payment of ₹45,000.00 from Meera Iyer/)).toBeVisible();
  await shoot(page, "r6-check-task");

  // The traveller's side.
  await customer.reload();
  await expect(customer.getByText("Coconut Lagoon Resort")).toBeVisible();
  await shoot(customer, "r6-trip-page");
  await customer.getByText("I've paid Advance").click();
  await shoot(customer, "r6-claim-form", { element: customer.locator("section", { hasText: "Payments" }).first() });
  await customer.getByText(/Traveller 2/).click();
  await shoot(customer, "r6-details-form", {
    element: customer.locator("section", { hasText: "Travellers' details" }),
  });

  // The PDFs, drawn as pictures.
  const folder = await mkdtemp(path.join(tmpdir(), "r6-pdf-"));
  for (const [name, documentId] of [
    ["r6-voucher", voucher.documentId],
    ["r6-itinerary", itinerary.documentId],
  ] as const) {
    let url = "";
    await expect
      .poll(
        async () => {
          const answered = await page.request.post("/api/trpc/bookings.documentLink", {
            data: { bookingId: meera.bookingId, documentId },
            headers: { origin: process.env.E2E_BASE_URL ?? "" },
          });
          if (!answered.ok()) return false;
          url = ((await answered.json()) as { result: { data: { url: string } } }).result.data.url;
          return true;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const pdf = path.join(folder, `${name}.pdf`);
    const png = path.join(folder, `${name}.png`);
    await writeFile(pdf, await (await page.request.get(url)).body());
    execFileSync("sips", ["-s", "format", "png", "--resampleWidth", "1240", pdf, "--out", png]);
    const picture = (await readFile(png)).toString("base64");
    await customer.setContent(
      `<body style="margin:0;background:#fff"><img alt="${name}" src="data:image/png;base64,${picture}" style="width:100%;display:block"></body>`,
    );
    await shoot(customer, name);
  }
  await traveller.close();

  // A booking about to be cancelled: the policy's charge and the refund, then the cancelled booking and its trip page.
  const isha = await acceptedQuote(page, browser, {
    name: "Isha Verma",
    phone: "+919876500006",
    title: "Ladakh road trip",
    days: 35,
  });
  await callApi(page, "bookings.confirm", { bookingId: isha.bookingId });
  await callApi(page, "quotes.recordPayment", {
    quoteId: isha.quoteId,
    amountPaise: 3_000_000,
    receivedOn: dayInIndia(0),
    method: "bank",
    reference: "NEFT-2231",
    requestId: crypto.randomUUID(),
  });
  await page.goto(`/bookings/${isha.bookingId}`);
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Why it is cancelled").fill("Travel dates clash with a wedding");
  await expect(dialog.getByText("10% of the trip total")).toBeVisible();
  await shoot(page, "r6-cancel");
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled", { exact: true })).toBeVisible();
  await shoot(page, "r6-cancelled");
  const after = await anotherPersonsDevice(browser);
  const cancelledPage = await after.newPage();
  await cancelledPage.goto(isha.link);
  await expect(cancelledPage.getByText(/This booking was cancelled on/)).toBeVisible();
  await shoot(cancelledPage, "r6-trip-cancelled");
  await after.close();

  await page.goto("/settings/bookings");
  await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
  await shoot(page, "r6-settings");
});
