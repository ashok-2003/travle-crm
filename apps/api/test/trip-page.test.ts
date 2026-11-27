// The trip page at /p/<token> in the app's look (spec 2026-11-27, customer pages polish): the booking's status as a pill,
// what is paid of the total with a bar, the next payment with Pay by UPI (the QR once the UPI id is verified), each payment
// due with its pill and an I've paid button, each traveller a row that opens to their form, the terms folded, Pay in a
// phone's bar while something is due, and whole rupees throughout.
import { createBookingFromQuote } from "@travel-crm/domain/bookings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate } from "./support/trpc.js";

describe("the trip page", () => {
  let server: TestServer;
  let agency: TestAgency;
  let jar: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    jar = await signedInOwner(server, agency);
    await server.db.forOrg(agency.organizationId, (tx) => tx.quoteSettings.create({ data: { upiId: "agency@bank" } }));
  });
  afterAll(async () => {
    await server.close();
  });

  /** A booking of `total` paise for two adults, leaving in 40 days (confirmed unless told), and its link. */
  async function aBooking(total = 100_000_00, confirmed = true) {
    const start = dayFrom(40);
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
          startDate: new Date(`${start}T00:00:00Z`),
          adults: 2,
          days: [{ title: "Arrive in Kaza", description: "Check in and rest" }],
          subtotalPaise: BigInt(total),
          totalPaise: BigInt(total),
        },
      });
      return { quoteId: quote.id };
    });
    const bookingId = await server.db.forOrg(agency.organizationId, (tx) =>
      createBookingFromQuote(
        tx,
        { organizationId: agency.organizationId, quoteId: made.quoteId, confirmed: false },
        new Date(),
      ),
    );
    if (bookingId === null) throw new Error("no booking");
    if (confirmed) await dataOf(await mutate(server, "bookings.confirm", { bookingId }, jar));
    const link = await dataOf<{ path: string }>(await mutate(server, "bookings.tripLink", { bookingId }, jar));
    return { ...made, bookingId, path: link.path };
  }

  /** A day some days from now (far enough from midnight in any zone to be the same day in India). */
  const dayFrom = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  /** The booking's payments due, in place of the default schedule confirming made. */
  async function withDues(quoteId: string, dues: { label: string; amountPaise: number; dueOn: string }[]) {
    await server.db.forOrg(agency.organizationId, async (tx) => {
      const made = await tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } });
      for (const [index, due] of dues.entries()) {
        const data = {
          label: due.label,
          amountPaise: BigInt(due.amountPaise),
          dueOn: new Date(`${due.dueOn}T00:00:00Z`),
        };
        const id = made[index]?.id;
        if (id === undefined) await tx.quoteInstallment.create({ data: { quoteId, ...data } });
        else await tx.quoteInstallment.update({ where: { id }, data });
      }
    });
  }

  const received = (quoteId: string, amountPaise: number) =>
    server.db.forOrg(agency.organizationId, (tx) =>
      tx.quotePayment.create({
        data: { quoteId, amountPaise: BigInt(amountPaise), receivedOn: new Date(), method: "upi" },
      }),
    );

  let nextAddress = 10;
  const from = () => ({ "x-forwarded-for": `198.51.100.${String((nextAddress += 1) % 250)}` });
  const page = async (path: string) => (await server.app.request(path, { headers: from() })).text();
  const post = (path: string, fields: Record<string, string>) =>
    server.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...from() },
      body: new URLSearchParams(fields).toString(),
    });

  /** The page's words as read, without its markup. */
  const words = (html: string) => {
    // Read character by character: a tag is skipped to its ">", a style or script element to its closing tag.
    let text = "";
    let at = 0;
    while (at < html.length) {
      if (html[at] !== "<") {
        text += html.charAt(at);
        at += 1;
        continue;
      }
      const element = /^<(style|script)\b/i.exec(html.slice(at, at + 8))?.[1]?.toLowerCase();
      const end = element === undefined ? html.indexOf(">", at) : html.indexOf(`</${element}>`, at);
      if (end === -1) break;
      at = end + (element === undefined ? 1 : element.length + 3);
    }
    return text.replace(/\s+/g, " ");
  };
  /** The card whose heading is `heading`. */
  const card = (html: string, heading: string) =>
    new RegExp(
      `<section[^>]*>(?:(?!</section>)[\\s\\S])*?<h2>${heading}</h2>(?:(?!</section>)[\\s\\S])*</section>`,
    ).exec(html)?.[0] ?? "";
  const phoneBar = (html: string) => /<nav class="bar"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? null;

  it("shows what is paid of the total, the next payment, each due's state, and Pay in a phone's bar", async () => {
    const { path, quoteId } = await aBooking(29_398_00);
    await withDues(quoteId, [
      { label: "Advance", amountPaise: 10_000_00, dueOn: dayFrom(-20) },
      { label: "Second payment", amountPaise: 5_000_00, dueOn: dayFrom(-3) },
      { label: "Balance", amountPaise: 14_398_00, dueOn: dayFrom(30) },
    ]);
    await received(quoteId, 10_000_00);
    const html = await page(path);

    expect(html).toContain('<span class="pill attention">Part paid</span>');
    expect(words(html)).toContain("₹10,000 of ₹29,398 paid");
    expect(html).toContain('<div class="progress" aria-hidden="true"><span style="width:34%"></span></div>');

    const next = card(html, "Next payment");
    expect(words(next)).toContain("₹5,000");
    expect(words(next)).toContain("Second payment, by");
    expect(next).toContain(">Pay by UPI</a>");
    expect(next).toContain("<strong>agency@bank</strong>");
    expect(next).not.toContain("UPI QR");

    const payments = card(html, "Payments");
    expect(payments).toMatch(
      /Advance<\/strong><span class="amount">₹10,000<\/span><span class="pill good">Paid<\/span>/,
    );
    expect(payments).toMatch(
      /Second payment<\/strong><span class="amount">₹5,000<\/span><span class="pill bad">Overdue<\/span>/,
    );
    expect(payments).toMatch(
      /Balance<\/strong><span class="amount">₹14,398<\/span><span class="pill attention">Due \d/,
    );
    // I've paid on the two still to pay, each named for its payment.
    expect(
      payments.match(/<summary class="button secondary">I've paid<span class="sr"> [^<]+<\/span><\/summary>/g),
    ).toEqual([
      `<summary class="button secondary">I've paid<span class="sr"> Second payment</span></summary>`,
      `<summary class="button secondary">I've paid<span class="sr"> Balance</span></summary>`,
    ]);

    const payLink = /<a class="button" href="([^"]+)">Pay by UPI/.exec(next)?.[1] ?? "";
    expect(payLink).toMatch(/^upi:\/\/pay\?pa=agency%40bank&.*am=5000\.00/);
    expect(phoneBar(html)).toBe(`<a class="button" href="${payLink}">Pay ₹5,000</a>`);
    // Whole rupees everywhere the customer reads an amount, the amounts they may type included.
    expect(words(html)).not.toMatch(/\d\.\d\d\b/);
    expect(html).toContain('value="5000"');
  });

  it("draws the UPI QR in Next payment only once the agency's UPI id is verified", async () => {
    const { path } = await aBooking();
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quoteSettings.updateMany({
        data: { upiVerifiedAt: new Date(), upiVerifiedBy: crypto.randomUUID(), upiVerifiedUpiId: "agency@bank" },
      }),
    );
    const next = card(await page(path), "Next payment");
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quoteSettings.updateMany({ data: { upiVerifiedAt: null, upiVerifiedBy: null, upiVerifiedUpiId: null } }),
    );
    expect(next).toMatch(/<svg role="img" aria-label="UPI QR to pay ₹30,000 to [^"]+"/);
    expect(next).toContain("<strong>agency@bank</strong>");
  });

  it("is Confirmed before any payment and Paid in full after the last, with nothing left to pay and no bar", async () => {
    const { path, quoteId } = await aBooking(10_000_00);
    const unpaid = await page(path);
    expect(unpaid).toContain('<span class="pill good">Confirmed</span>');
    // Nothing paid yet: no "₹0 of" and no empty bar.
    expect(unpaid).not.toContain('class="paid-of"');
    expect(unpaid).not.toContain('class="progress"');
    expect(card(unpaid, "Your booking")).toBe("");
    await received(quoteId, 10_000_00);
    const html = await page(path);
    expect(html).toContain('<span class="pill good">Paid in full</span>');
    expect(html).toContain('<span style="width:100%">');
    expect(html).not.toContain("Next payment");
    expect(html).not.toContain("I've paid");
    expect(phoneBar(html)).toBeNull();
  });

  it("gives each due's I've paid form ids of its own, though the dues were saved together", async () => {
    const html = await page((await aBooking()).path);
    expect(html.match(/<summary class="button secondary">I've paid/g)).toHaveLength(2);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(8);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    // Each label names its own form's field.
    const labels = [...html.matchAll(/<label for="([^"]+)"/g)].map((match) => match[1]);
    expect(labels.every((id) => ids.includes(id))).toBe(true);
  });

  it("offers no Pay in a phone's bar while a payment is being verified, on the trip's page and the quote's", async () => {
    for (const confirmed of [true, false]) {
      const { path } = await aBooking(100_000_00, confirmed);
      expect(phoneBar(await page(path))).toMatch(/>Pay ₹[\d,]+<\/a>$/);
      const claimed = await post(path, { form: "claim", installment: "", amount: "1000", reference: "UTR1" });
      expect(claimed.headers.get("location")).toContain("done=claimed");
      const html = await page(path);
      expect(html).toContain("Payment being verified");
      expect(phoneBar(html)).toBeNull();
    }
  });

  it("lists each traveller as a row that opens to their form, the first still needed open", async () => {
    const { path } = await aBooking();
    let html = await page(path);
    expect(words(html)).toContain("0 of 2 done");
    expect(html.match(/<details class="fold traveller"( open)?>/g)).toEqual([
      '<details class="fold traveller" open>',
      '<details class="fold traveller">',
    ]);
    expect(html.match(/<span class="pill attention">Details needed<\/span>/g)).toHaveLength(2);

    const first = /name="traveller" value="([^"]+)"/.exec(html)?.[1] ?? "";
    const saved = await post(path, {
      form: "traveller",
      traveller: first,
      name: "Asha Rao",
      dateOfBirth: "1990-04-02",
    });
    expect(saved.headers.get("location")).toContain("done=saved");
    html = await page(path);
    expect(words(html)).toContain("1 of 2 done");
    expect(html).toMatch(
      /<details class="fold traveller"><summary>[\s\S]*?Asha Rao[\s\S]*?<span class="pill good">Details received<\/span>/,
    );
    expect(html.match(/<details class="fold traveller"( open)?>/g)).toEqual([
      '<details class="fold traveller">',
      '<details class="fold traveller" open>',
    ]);
  });

  it("folds the cancellation terms, open on a cancelled booking, which says Cancelled and asks for nothing", async () => {
    const { path, bookingId } = await aBooking();
    expect(card(await page(path), "Cancellation terms")).toMatch(/^<section class="fold"><details><summary><h2>/);
    await dataOf(await mutate(server, "bookings.cancel", { bookingId, reason: "Change of plans" }, jar));
    const html = await page(path);
    expect(html).toContain('<span class="pill bad">Cancelled</span>');
    expect(card(html, "Cancellation terms")).toMatch(/^<section class="fold"><details open><summary><h2>/);
    expect(html).toContain("This booking was cancelled on");
    expect(html).not.toContain("Next payment");
    expect(phoneBar(html)).toBeNull();
  });
});
