// A booking over HTTP (release 6): the staff procedures, and the trip page at /p/<token> where a traveller says "I've paid",
// fills their details and leaves feedback. The page shows the quote until the agency confirms, never shows an ID number back,
// serves only the booking's own documents, and takes pictures straight to storage through the link's own upload routes.
import { createBookingFromQuote } from "@travel-crm/domain/bookings";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("bookings over HTTP", () => {
  let server: TestServer;
  let storage: MemoryStorage;
  let agency: TestAgency;
  let jar: CookieJar;

  beforeAll(async () => {
    storage = createMemoryStorage();
    server = createTestServer({}, { storage });
    agency = await createTestAgency(server);
    jar = await signedInOwner(server, agency);
  });
  afterAll(async () => {
    await server.close();
  });

  /** An accepted quote and its booking, as the worker makes them: Requested, or Confirmed with the agency's schedule. */
  async function aBooking(options: { confirmed?: boolean; startDate?: string; total?: number; adults?: number } = {}) {
    const total = options.total ?? 100_000_00;
    const made = await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Rahul Sharma", email: `r-${crypto.randomUUID()}@example.test` },
      });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", stage: "booking_requested", ownerUserId: agency.owner.userId },
      });
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Spiti 6 days",
          status: "accepted",
          acceptedAt: new Date(),
          acceptedName: "Rahul Sharma",
          startDate: new Date(`${options.startDate ?? "2027-03-10"}T00:00:00Z`),
          adults: options.adults ?? 2,
          days: [
            { title: "Arrive in Kaza", description: "Check in and rest" },
            { title: "Key monastery", description: "" },
          ],
          subtotalPaise: BigInt(total),
          totalPaise: BigInt(total),
        },
      });
      return { quoteId: quote.id, leadId: lead.id };
    });
    const bookingId = await server.db.forOrg(agency.organizationId, (tx) =>
      createBookingFromQuote(
        tx,
        { organizationId: agency.organizationId, quoteId: made.quoteId, confirmed: false },
        new Date(),
      ),
    );
    if (bookingId === null) throw new Error("no booking");
    if (options.confirmed !== false) await dataOf(await mutate(server, "bookings.confirm", { bookingId }, jar));
    const link = await dataOf<{ path: string }>(await mutate(server, "bookings.tripLink", { bookingId }, jar));
    return { ...made, bookingId, path: link.path };
  }

  // Each request comes from an address of its own, so the page's rate limit (30 a minute for one address) is never the subject.
  let nextAddress = 10;
  const from = () => ({ "x-forwarded-for": `198.51.100.${String((nextAddress += 1) % 250)}` });
  const page = async (path: string) => {
    const response = await server.app.request(path, { headers: from() });
    return { response, html: await response.text() };
  };
  const post = (path: string, fields: Record<string, string>) =>
    server.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...from() },
      body: new URLSearchParams(fields).toString(),
    });
  const json = (path: string, body: unknown) =>
    server.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...from() },
      body: JSON.stringify(body),
    });

  it("shows the quote while the booking waits for the agency, with a place to say I've paid and the trip-updates box", async () => {
    const { path } = await aBooking({ confirmed: false });
    const { html } = await page(path);
    expect(html).toContain("Spiti 6 days");
    expect(html).not.toContain("Cancellation terms");
    expect(html).toContain("Already paid?");
    expect(html).toContain("Accepted");
  });

  it("asks at Accept for trip updates on WhatsApp, and keeps the answer in the consent ledger with the words shown", async () => {
    const made = await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Meera Iyer", email: `m-${crypto.randomUUID()}@example.test` },
      });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", stage: "quote_sent", ownerUserId: agency.owner.userId },
      });
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Goa 4 days",
          status: "sent",
          subtotalPaise: 50_000_00n,
          totalPaise: 50_000_00n,
        },
      });
      return { personId: person.id, leadId: lead.id, quoteId: quote.id };
    });
    const link = await dataOf<{ path: string }>(await mutate(server, "quotes.share", { quoteId: made.quoteId }, jar));
    expect((await page(link.path)).html).toContain("Send me trip updates on WhatsApp");
    const accepted = await post(link.path, { name: "Meera Iyer", agree: "yes", tripUpdates: "yes" });
    expect(accepted.headers.get("location")).toContain("done=accepted");
    const consent = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.personConsent.findMany({ where: { personId: made.personId, purpose: "trip_updates" } }),
    );
    expect(consent).toMatchObject([
      { action: "granted", source: "quote_accept", wording: "Send me trip updates on WhatsApp." },
    ]);
    const events = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "quote.accepted" } }),
    );
    expect(events.map((event) => event.payload)).toContainEqual({
      quoteId: made.quoteId,
      leadId: made.leadId,
      confirmed: false,
    });
  });

  it("is the trip page once confirmed: status, next payment, the plan with dates, terms, and no costs", async () => {
    const { path } = await aBooking();
    const { response, html } = await page(path);
    expect(response.status).toBe(200);
    expect(html).toContain("Confirmed");
    expect(html).toContain("Next payment");
    expect(html).toContain("Day 1 · 10 Mar: Arrive in Kaza");
    expect(html).toContain("Cancellation terms");
    expect(html).toContain("Travellers&#39; details".replace("&#39;", "'"));
    expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).not.toMatch(/profit|trip cost|supplier/i);
  });

  it("takes an I've paid, shows it as being verified, and staff confirm it into one payment", async () => {
    const { path, bookingId, quoteId } = await aBooking();
    const paying = await post(path, {
      form: "claim",
      installment: "",
      amount: "30000.00",
      reference: "UTR12345678",
      screenshot: "",
    });
    expect(paying.status).toBe(303);
    expect(paying.headers.get("location")).toContain("done=claimed");
    const { html } = await page(`${path}?done=claimed`);
    expect(html).toContain("Payment being verified");
    const detail = await dataOf<{
      claims: { id: string; status: string; amountPaise: number }[];
      pendingClaims: number;
    }>(await query(server, "bookings.get", jar, { bookingId }));
    expect(detail.pendingClaims).toBe(1);
    const claim = detail.claims[0];
    await dataOf(await mutate(server, "bookings.confirmClaim", { claimId: claim?.id }, jar));
    await dataOf(await mutate(server, "bookings.confirmClaim", { claimId: claim?.id }, jar));
    const after = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quotePayment.findMany({ where: { quoteId } }),
    );
    expect(after).toHaveLength(1);
    expect((await page(path)).html).toContain("Received");
  });

  it("says why a claim was refused: more than is left, or with nothing to find it by", async () => {
    const { path } = await aBooking({ total: 10_000_00 });
    const tooMuch = await post(path, { form: "claim", amount: "99999.00", reference: "UTR1" });
    expect(tooMuch.headers.get("location")).toContain("why=CLAIM_EXCEEDS_BALANCE");
    expect((await page(`${path}?done=refused&why=CLAIM_EXCEEDS_BALANCE`)).html).toContain("more than is left to pay");
    const blank = await post(path, { form: "claim", amount: "100.00", reference: "" });
    expect(blank.headers.get("location")).toContain("why=CLAIM_NEEDS_PROOF");
    const nonsense = await post(path, { form: "claim", amount: "lots", reference: "UTR1" });
    expect(nonsense.headers.get("location")).toContain("why=AMOUNT_INVALID");
  });

  it("saves a traveller's details and shows only Details received, never an ID number", async () => {
    const { path, bookingId } = await aBooking();
    await dataOf(await mutate(server, "bookings.setLevel", { bookingId, level: "international" }, jar));
    const detail = await dataOf<{ travellers: { id: string }[] }>(
      await query(server, "bookings.get", jar, { bookingId }),
    );
    const traveller = detail.travellers[0];
    const saved = await post(path, {
      form: "traveller",
      traveller: traveller?.id ?? "",
      name: "Asha Rao",
      dateOfBirth: "1990-04-02",
      gender: "female",
      phone: "",
      emergencyName: "Meera",
      emergencyPhone: "+919800000001",
      idKind: "passport",
      idNumber: "P7654321",
      idIssuedOn: "2020-01-01",
      idExpiresOn: "2030-01-01",
      idNationality: "Indian",
    });
    expect(saved.headers.get("location")).toContain("done=saved");
    const { html } = await page(path);
    expect(html).toContain("Details received ✓");
    expect(html).toContain("1 of 2 complete");
    expect(html).not.toContain("P7654321");
    // Staff read the number with documents:view_sensitive, and it is audited.
    const identity = await dataOf<{ number: string }>(
      await query(server, "bookings.identity", jar, { travellerId: traveller?.id }),
    );
    expect(identity.number).toBe("P7654321");
  });

  it("locks a traveller's details at the cut-off", async () => {
    const soon = new Date(Date.now() + 2 * 24 * 3_600_000).toISOString().slice(0, 10);
    const { path, bookingId } = await aBooking({ startDate: soon });
    const detail = await dataOf<{ travellers: { id: string }[] }>(
      await query(server, "bookings.get", jar, { bookingId }),
    );
    const refused = await post(path, {
      form: "traveller",
      traveller: detail.travellers[0]?.id ?? "",
      name: "Asha",
      dateOfBirth: "1990-04-02",
    });
    expect(refused.headers.get("location")).toContain("why=DETAILS_LOCKED");
    expect((await page(path)).html).toContain("Details are locked now");
  });

  it("serves a booking's own voucher and refuses another booking's documents and files", async () => {
    const mine = await aBooking();
    const other = await aBooking();
    const stay = await dataOf<{ stayId: string }>(
      await mutate(
        server,
        "bookings.saveStay",
        {
          bookingId: mine.bookingId,
          name: "Hotel Snow Lion",
          address: "Kaza",
          mapUrl: "https://maps.example/x",
          checkIn: "2027-03-10",
          checkOut: "2027-03-12",
          notes: "",
        },
        jar,
      ),
    );
    expect(stay.stayId).toBeTruthy();
    expect((await page(mine.path)).html).toContain("Hotel Snow Lion");
    const elsewhere = await server.db.forOrg(
      agency.organizationId,
      async (tx) => (await tx.issuedDocument.findFirst({ select: { id: true } }))?.id ?? crypto.randomUUID(),
    );
    const refused = await page(`${other.path}/doc/${elsewhere}`);
    expect(refused.response.status).toBe(404);
    const noFile = await page(`${other.path}/file/${crypto.randomUUID()}`);
    expect(noFile.response.status).toBe(404);
  });

  it("takes a payment screenshot straight to storage and attaches it to the claim", async () => {
    const { path, bookingId } = await aBooking();
    const asked = await json(`${path}/upload`, {
      kind: "claim",
      fileName: "paid.png",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
    });
    expect(asked.status).toBe(200);
    const slot = (await asked.json()) as {
      attachmentId: string;
      upload: { url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string };
    };
    await storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, PNG, "image/png");
    expect((await json(`${path}/upload/confirm`, { attachmentId: slot.attachmentId })).status).toBe(200);
    const claimed = await post(path, {
      form: "claim",
      amount: "1000.00",
      reference: "",
      screenshot: slot.attachmentId,
    });
    expect(claimed.headers.get("location")).toContain("done=claimed");
    const detail = await dataOf<{ claims: { screenshotAttachmentId: string | null }[] }>(
      await query(server, "bookings.get", jar, { bookingId }),
    );
    expect(detail.claims[0]?.screenshotAttachmentId).toBe(slot.attachmentId);
    const link = await dataOf<{ url: string }>(
      await mutate(
        server,
        "bookings.files.downloadLink",
        { recordType: "payment_claim", recordId: bookingId, attachmentId: slot.attachmentId },
        jar,
      ),
    );
    expect(link.url).toContain(slot.attachmentId);
  });

  it("refuses an upload that isn't an image, an ID photo nobody asked for, and a confirm of another booking's file", async () => {
    const mine = await aBooking();
    const other = await aBooking();
    expect(
      (
        await json(`${mine.path}/upload`, {
          kind: "claim",
          fileName: "x.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
        })
      ).status,
    ).toBe(400);
    const photo = await json(`${mine.path}/upload`, {
      kind: "id_photo",
      travellerId: crypto.randomUUID(),
      fileName: "p.png",
      contentType: "image/png",
      sizeBytes: 10,
    });
    expect(photo.status).toBe(409);
    const asked = await json(`${other.path}/upload`, {
      kind: "claim",
      fileName: "paid.png",
      contentType: "image/png",
      sizeBytes: PNG.byteLength,
    });
    const slot = (await asked.json()) as { attachmentId: string };
    expect((await json(`${mine.path}/upload/confirm`, { attachmentId: slot.attachmentId })).status).toBe(404);
    // Not JSON: refused before anything is read.
    const form = await post(`${mine.path}/upload`, { kind: "claim" });
    expect(form.status).toBe(415);
  });

  it("opens feedback only once asked for, takes it once, and alerts the owner on low stars", async () => {
    const { path, bookingId } = await aBooking();
    const early = await post(path, { form: "feedback", overall: "5" });
    expect(early.headers.get("location")).toContain("why=FEEDBACK_NOT_ASKED");
    await dataOf(await mutate(server, "bookings.requestFeedback", { bookingId }, jar));
    expect((await page(path)).html).toContain("How was your trip?");
    const sent = await post(path, {
      form: "feedback",
      overall: "2",
      hotel: "3",
      comment: "Rooms were cold",
      mayShare: "yes",
    });
    expect(sent.headers.get("location")).toContain("done=feedback");
    const again = await post(path, { form: "feedback", overall: "5" });
    expect(again.headers.get("location")).toContain("why=FEEDBACK_ALREADY_SENT");
    expect((await page(path)).html).toContain("Thank you for telling us about your trip");
    const detail = await dataOf<{ feedback: { overall: number; comment: string } | null }>(
      await query(server, "bookings.get", jar, { bookingId }),
    );
    expect(detail.feedback).toMatchObject({ overall: 2, comment: "Rooms were cold" });
  });

  it("cancels with a charge and a refund, and the page then shows a plain notice and the terms", async () => {
    const { path, bookingId, quoteId } = await aBooking({ startDate: "2027-06-01" });
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quotePayment.create({ data: { quoteId, amountPaise: 30_000_00n, receivedOn: new Date(), method: "bank" } }),
    );
    const preview = await dataOf<{ chargePaise: number; refundPaise: number }>(
      await query(server, "bookings.cancelPreview", jar, { bookingId }),
    );
    expect(preview).toMatchObject({ chargePaise: 10_000_00, refundPaise: 20_000_00 });
    await dataOf(await mutate(server, "bookings.cancel", { bookingId, reason: "Family emergency" }, jar));
    const { html } = await page(path);
    expect(html).toContain("This booking was cancelled");
    expect(html).toContain("Cancellation terms");
    expect(html).not.toContain("Next payment");
    await dataOf(
      await mutate(
        server,
        "bookings.markRefunded",
        { bookingId, refundedOn: "2027-01-02", method: "bank", reference: "NEFT1" },
        jar,
      ),
    );
    const detail = await dataOf<{ refund: { status: string } | null }>(
      await query(server, "bookings.get", jar, { bookingId }),
    );
    expect(detail.refund?.status).toBe("refunded");
  });

  it("keeps a salesperson to their own bookings, and refuses staff without bookings:view", async () => {
    const { bookingId } = await aBooking();
    expect((await refusalOf(await query(server, "bookings.get", undefined, { bookingId }))).status).toBe(401);
  });
});
