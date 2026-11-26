// The customer's quote page at /p/<token>: reads in the owner's order, accepts with a name alone (no tick boxes) and keeps what
// the two ticks kept, shows what to pay once accepted, carries no script and fits a 360px phone.
import { qrSvg } from "@travel-crm/integrations/qr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate } from "./support/trpc.js";

const SMALL_PRINT =
  "By accepting this quote I agree to the terms and cancellation policy, and to get trip updates on WhatsApp.";

describe("the customer's quote page", () => {
  let server: TestServer;
  let agency: TestAgency;
  let jar: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    jar = await signedInOwner(server, agency);
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quoteSettings.create({
        data: {
          upiId: "agency@bank",
          defaultTerms: "Cancel 15 days before: 50% back.",
          defaultTaxRateBasisPoints: 500,
        },
      }),
    );
  });
  afterAll(async () => {
    await server.close();
  });

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

  async function aQuote(title = "Goa 4 days", taxed = true) {
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
          title,
          status: "sent",
          startDate: new Date("2026-12-04T00:00:00Z"),
          adults: 1,
          days: [
            { title: "Arrive in Goa", description: "Check in" },
            { title: "North beaches", description: "" },
          ],
          items: [{ description: "Hotel", detail: "", quantity: 1, unitPricePaise: 50_000_00 }],
          inclusions: "Breakfast\nAirport pickup",
          exclusions: "Flights",
          notes: "Carry ID",
          subtotalPaise: 50_000_00n,
          ...(taxed
            ? { taxRateBasisPoints: 500, taxPaise: 2_500_00n, totalPaise: 52_500_00n }
            : { totalPaise: 50_000_00n }),
        },
      });
      return { personId: person.id, leadId: lead.id, quoteId: quote.id };
    });
    const link = await dataOf<{ path: string }>(await mutate(server, "quotes.share", { quoteId: made.quoteId }, jar));
    return { ...made, path: link.path };
  }

  const positions = (html: string, ...needles: string[]) => needles.map((needle) => html.indexOf(needle));
  const inOrder = (list: number[]) =>
    list.every((at, index) => at >= 0 && (index === 0 || at > (list[index - 1] ?? 0)));

  it("reads agency, To, trip, date and people, Accept, Price, days, inclusions, exclusions, notes, terms, small print", async () => {
    const { path } = await aQuote();
    const { response, html } = await page(path);
    expect(response.status).toBe(200);
    expect(html).toContain("To: Meera Iyer");
    expect(html).toContain("Fri 4 Dec 2026 · 1 adult");
    expect(
      inOrder(
        positions(
          html,
          "To: Meera Iyer",
          "<h1>Goa 4 days</h1>",
          "Fri 4 Dec 2026",
          'id="accept"',
          "<h2>Price</h2>",
          "Arrive in Goa",
          "Airport pickup",
          "Flights",
          "Carry ID",
          "Cancel 15 days before",
          "By accepting this quote I agree to the",
        ),
      ),
    ).toBe(true);
    expect(html).toContain("₹52,500");
    // The lines, one GST row that makes them add up (50,000 + 2,500 = 52,500), then the total.
    expect(
      inOrder(positions(html, "<h2>Price</h2>", "Hotel × 1", "₹50,000", "GST 5%", "₹2,500", 'class="total">₹52,500')),
    ).toBe(true);
    expect(html).not.toContain("52,500.00");
    expect(html).not.toMatch(/CGST|SGST/);
    expect(html).not.toContain("<script");
    expect(response.headers.get("content-security-policy")).not.toContain("script-src");
  });

  it("shows no GST row on a quote without tax", async () => {
    const { path } = await aQuote("Goa 4 days", false);
    const { html } = await page(path);
    expect(html).toContain("₹50,000");
    expect(html).not.toMatch(/GST|CGST|SGST/);
  });

  it("has no tick boxes, one Accept button, and a small-print line linking to the terms on the page", async () => {
    const { path } = await aQuote();
    const { html } = await page(path);
    expect(html).not.toContain('type="checkbox"');
    expect(html.match(/<button type="submit"[^>]*>Accept/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="#terms">terms and cancellation policy<\/a>/);
    expect(html.replace(/<[^>]+>/g, "")).toContain(SMALL_PRINT);
    expect(html).toContain('id="terms"');
  });

  it("accepts with a name alone and stores the same as the two ticks did: the name, the audit, the trip-updates consent", async () => {
    const made = await aQuote();
    const accepted = await post(made.path, { name: "Meera Iyer" });
    expect(accepted.headers.get("location")).toContain("done=accepted");
    const stored = await server.db.forOrg(agency.organizationId, async (tx) => ({
      quote: await tx.quote.findUniqueOrThrow({ where: { id: made.quoteId } }),
      consent: await tx.personConsent.findMany({ where: { personId: made.personId } }),
      audit: await tx.auditEntry.findMany({ where: { entityId: made.quoteId, action: "quote.accepted-by-customer" } }),
      events: await tx.outboxEvent.findMany({ where: { type: "quote.accepted" } }),
    }));
    expect(stored.quote).toMatchObject({ status: "accepted", acceptedName: "Meera Iyer" });
    expect(stored.consent).toMatchObject([
      { purpose: "trip_updates", action: "granted", source: "quote_accept", wording: SMALL_PRINT },
    ]);
    expect(stored.audit).toHaveLength(1);
    expect(stored.events.map((event) => event.payload)).toContainEqual({
      quoteId: made.quoteId,
      leadId: made.leadId,
      confirmed: false,
    });
    // Trip updates about this booking only: no offers consent.
    expect(stored.consent.some((row) => row.purpose !== "trip_updates")).toBe(false);
    // Accepting again changes nothing and records no second consent.
    await post(made.path, { name: "Meera Iyer" });
    expect(
      await server.db.forOrg(agency.organizationId, (tx) =>
        tx.personConsent.count({ where: { personId: made.personId } }),
      ),
    ).toBe(1);
  });

  it("refuses an acceptance with no name, recording nothing", async () => {
    const made = await aQuote();
    const refused = await post(made.path, { name: "  " });
    expect(refused.headers.get("location")).toContain("refused");
    const consent = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.personConsent.count({ where: { personId: made.personId } }),
    );
    expect(consent).toBe(0);
  });

  it("once accepted, the Accept place shows what to pay now, Pay by UPI and the UPI id", async () => {
    const made = await aQuote();
    await post(made.path, { name: "Meera Iyer" });
    const { html } = await page(made.path);
    expect(html).not.toContain('name="name"');
    expect(html).toContain("Pay by UPI");
    expect(html).toContain("agency@bank");
    expect(inOrder(positions(html, "Fri 4 Dec 2026", "Accepted by Meera Iyer", "Pay by UPI", "<h2>Price</h2>"))).toBe(
      true,
    );
  });

  it("draws the UPI QR in the Pay now section: the button's own link, named for a screen reader, no script", async () => {
    const made = await aQuote();
    await post(made.path, { name: "Meera Iyer" });
    const { html } = await page(made.path);
    const href = /<a class="button" href="([^"]+)">Pay by UPI/.exec(html)?.[1]?.replaceAll("&amp;", "&") ?? "";
    expect(href).toMatch(/^upi:\/\/pay\?pa=agency%40bank&pn=.+&am=52500\.00&cu=INR&tn=Goa%204%20days$/);
    const qr = /<svg role="img" aria-label="UPI QR to pay ₹52,500 to ([^"]+)"[\s\S]*?<\/svg>/.exec(html);
    expect(qr).not.toBeNull();
    expect(qr?.[0]).toBe(qrSvg(href, `UPI QR to pay ₹52,500 to ${qr?.[1] ?? ""}`));
    expect(html).toContain("<strong>agency@bank</strong>");
    expect(html).not.toContain("<script");
  });

  it("draws no QR without a UPI id", async () => {
    await server.db.forOrg(agency.organizationId, (tx) => tx.quoteSettings.updateMany({ data: { upiId: "" } }));
    const made = await aQuote();
    await post(made.path, { name: "Meera Iyer" });
    const { html } = await page(made.path);
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quoteSettings.updateMany({ data: { upiId: "agency@bank" } }),
    );
    expect(html).not.toContain("UPI QR");
    expect(html).not.toContain("Pay by UPI");
  });

  it("with several options, the radio choice comes before the name and the one Accept button", async () => {
    const made = await aQuote("Goa 3-star");
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.quote.create({
        data: {
          leadId: made.leadId,
          title: "Goa 4-star",
          status: "sent",
          subtotalPaise: 70_000_00n,
          totalPaise: 70_000_00n,
        },
      }),
    );
    const { html } = await page(made.path);
    expect(html).toContain("Details below are for Goa 3-star.");
    expect(html.match(/type="radio"/g)?.length).toBe(2);
    expect(inOrder(positions(html, 'type="radio"', 'name="name"', "Accept"))).toBe(true);
    expect(html.match(/<button type="submit"[^>]*>Accept/g)).toHaveLength(1);
  });

  it("holds every box inside a 360px phone", async () => {
    const { path } = await aQuote();
    const { html } = await page(path);
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(css).toContain("box-sizing:border-box");
    expect(css).toContain("overflow-wrap:anywhere");
    expect(css).not.toMatch(/width:\s*(?:3[6-9]\d|[4-9]\d\d)px/);
    expect(html).toContain("width=device-width");
  });
});
