// The quotation's PDF is issued in the quotation template's own words: the whole trip name, the day and people as
// "Fri 4 Dec 2026 · 1 adult", whole rupees, "incl. 5% GST", what is due by when, and the lists as points. The invoice and
// receipt stay on the sample template with their tax rows.
import { randomUUID } from "node:crypto";
import type { CreateQuoteInput } from "@travel-crm/contracts/quotes";
import { issuedDocumentRenderInput } from "@travel-crm/contracts/documents";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addInstallment,
  createQuote,
  issueQuoteInvoice,
  issueQuotePdf,
  recordPayment,
  saveQuoteSettings,
  verifyUpi,
  setQuoteStatus,
} from "../../src/quotes/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";

const title = "Manali, Sissu and Kasol: Strangers Trip (5N/6D) from Delhi, a long name that once got cut off";
const context = {
  branding: { organizationName: "Sharma Holidays", terms: "50% to book." },
  supplierStateCode: "27",
  gstin: "27ABCDE1234F1Z5",
  invoicePrefix: null,
  now: new Date("2026-11-27T06:00:00Z"),
};

describe("the quotation's PDF", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Quote PDF");
  });
  afterAll(async () => {
    await world.close();
  });

  const aQuote = (overrides: Partial<CreateQuoteInput> = {}, withDues = true) =>
    world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title,
          startDate: "2026-12-04",
          adults: 1,
          children: 0,
          days: [
            { title: "Delhi to Manali", description: "Overnight Volvo." },
            { title: "Sissu", description: "" },
          ],
          items: [
            {
              description: "Strangers Trip",
              detail: "",
              quantity: 1,
              unitPricePaise: 800_000,
            },
          ],
          inclusions: "- Stay\n✓ Breakfast",
          exclusions: "Lunch",
          notes: "Carry a jacket\n\nBring ID",
          taxRateBasisPoints: 500,
          placeOfSupply: "27",
          ...overrides,
        },
        { supplierStateCode: "27", now: context.now },
      );
      for (const [label, amountPaise, dueOn] of [
        ["Advance", 300_000, "2026-12-01"],
        ["Balance", 540_000, "2026-12-03"],
      ] as const) {
        if (!withDues) break;
        await addInstallment(tx, world.manager, { quoteId: quote.id, label, amountPaise, dueOn });
      }
      return quote;
    });

  it("reads like the quote page: trip, when, whole rupees, GST note, dues, days and points", async () => {
    const quote = await aQuote();
    const issued = await world.inOrg((tx) => issueQuotePdf(tx, world.manager, quote.id, context));
    const stored = await world.inOrg((tx) => tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.documentId } }));
    expect(stored.template).toBe("quotation");
    const { data } = issuedDocumentRenderInput.parse(stored.renderInput);
    expect(data).toMatchObject({
      title,
      when: "Fri 4 Dec 2026 · 1 adult",
      gst: { label: "GST 5%", amount: "₹400" },
      total: "₹8,400",
      totalNote: "incl. 5% GST",
      lines: [{ description: "Strangers Trip × 1", amount: "₹8,000" }],
      dues: [
        { label: "Advance", by: "1 Dec 2026", amount: "₹3,000" },
        { label: "Balance", by: "3 Dec 2026", amount: "₹5,400" },
      ],
      days: [{ title: "Delhi to Manali", description: "Overnight Volvo." }, { title: "Sissu" }],
      inclusions: ["Stay", "Breakfast"],
      exclusions: ["Lunch"],
      notes: ["Carry a jacket", "Bring ID"],
    });
    expect(JSON.stringify(data)).not.toMatch(/CGST|SGST|Taxable/);
  });

  describe("the Pay box", () => {
    const issueData = async (quote: { id: string }) => {
      const issued = await world.inOrg((tx) => issueQuotePdf(tx, world.manager, quote.id, context));
      const stored = await world.inOrg((tx) =>
        tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.documentId } }),
      );
      return issuedDocumentRenderInput.parse(stored.renderInput).data;
    };
    const withUpi = (upiId: string) =>
      world.inOrg((tx) =>
        saveQuoteSettings(tx, world.manager, {
          upiId,
          upiName: "Sharma Holidays",
          defaultTaxRateBasisPoints: 500,
          defaultTerms: "",
          defaultMarkupBasisPoints: 0,
          minMarginBasisPoints: null,
          minMarginPerPersonPaise: null,
        }),
      );

    it("carries the link, the UPI id, the name and the amount due now when the agency has a UPI id", async () => {
      await withUpi("sharma@bank");
      await world.inOrg((tx) => verifyUpi(tx, world.manager, context.now));
      const quote = await aQuote();
      const data = await issueData(quote);
      expect(data).toMatchObject({
        pay: {
          upiId: "sharma@bank",
          name: "Sharma Holidays",
          amount: "₹3,000",
          link: `upi://pay?pa=sharma%40bank&pn=Sharma%20Holidays&am=3000.00&cu=INR&tn=${encodeURIComponent(Array.from(title).slice(0, 50).join("")).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        },
      });
    });

    it("draws its QR (carries the link) only once the UPI QR is verified for the current UPI id", async () => {
      // Changing the id clears whatever an earlier test verified.
      await withUpi("reset@bank");
      await withUpi("sharma@bank");
      const unverified = await issueData(await aQuote());
      expect(unverified).toMatchObject({ pay: { upiId: "sharma@bank", amount: "₹3,000" } });
      expect(unverified).not.toHaveProperty("pay.link");
      await world.inOrg((tx) => verifyUpi(tx, world.manager, context.now));
      const verified = await issueData(await aQuote());
      expect(verified).toHaveProperty("pay.link");
      expect(JSON.stringify(verified)).toContain("upi://pay?pa=sharma%40bank");
      // A new UPI id was never scanned.
      await withUpi("sharma@other");
      expect(await issueData(await aQuote())).not.toHaveProperty("pay.link");
    });

    it("has none without a UPI id", async () => {
      await withUpi("");
      const data = await issueData(await aQuote());
      expect(data).not.toHaveProperty("pay");
    });

    it("names the payee as the QR's link does: the UPI name, else the UPI id", async () => {
      await world.inOrg((tx) =>
        saveQuoteSettings(tx, world.manager, {
          upiId: "noname@bank",
          upiName: "",
          defaultTaxRateBasisPoints: 500,
          defaultTerms: "",
          defaultMarkupBasisPoints: 0,
          minMarginBasisPoints: null,
          minMarginPerPersonPaise: null,
        }),
      );
      expect(await issueData(await aQuote())).toMatchObject({ pay: { upiId: "noname@bank", name: "noname@bank" } });
    });
  });

  describe("kept or issued anew", () => {
    const issueOf = (quoteId: string) => world.inOrg((tx) => issueQuotePdf(tx, world.manager, quoteId, context));
    const dataOf = async (documentId: string) =>
      issuedDocumentRenderInput.parse(
        (await world.inOrg((tx) => tx.issuedDocument.findUniqueOrThrow({ where: { id: documentId } }))).renderInput,
      ).data;
    const upi = (upiId: string) =>
      world.inOrg((tx) =>
        saveQuoteSettings(tx, world.manager, {
          upiId,
          upiName: "Sharma Holidays",
          defaultTaxRateBasisPoints: 500,
          defaultTerms: "",
          defaultMarkupBasisPoints: 0,
          minMarginBasisPoints: null,
          minMarginPerPersonPaise: null,
        }),
      );

    it("gives the PDF issued before while nothing on it changed", async () => {
      await upi("sharma@bank");
      const quote = await aQuote();
      const first = await issueOf(quote.id);
      expect(await issueOf(quote.id)).toEqual(first);
    });

    it("issues anew once a payment is recorded: the advance paid, the next amount to pay", async () => {
      await upi("sharma@bank");
      const quote = await aQuote();
      await world.inOrg((tx) =>
        setQuoteStatus(tx, world.manager, { quoteId: quote.id, status: "sent" }, context.now, "27"),
      );
      const before = await issueOf(quote.id);
      expect(await dataOf(before.documentId)).toMatchObject({ pay: { amount: "₹3,000" } });
      await world.inOrg((tx) =>
        recordPayment(
          tx,
          world.manager,
          {
            quoteId: quote.id,
            amountPaise: 300_000,
            receivedOn: "2026-11-27",
            method: "upi",
            reference: "",
            requestId: randomUUID(),
          },
          context.now,
        ),
      );
      const after = await issueOf(quote.id);
      expect(after.number).not.toBe(before.number);
      const data = await dataOf(after.documentId);
      expect(data).toMatchObject({
        pay: { amount: "₹5,400" },
        dues: [
          { label: "Advance", paid: true },
          { label: "Balance", amount: "₹5,400" },
        ],
      });
      if (!("dues" in data)) throw new Error("Not a quotation");
      expect(data.dues[1]).not.toHaveProperty("paid");
    });

    it("issues anew without the old UPI id once the id changes", async () => {
      await upi("sharma@bank");
      const quote = await aQuote();
      const before = await issueOf(quote.id);
      await upi("sharma@newbank");
      const after = await issueOf(quote.id);
      expect(after.number).not.toBe(before.number);
      const text = JSON.stringify(await dataOf(after.documentId));
      expect(text).toContain("sharma@newbank");
      expect(text).not.toContain("sharma@bank");
    });
  });

  it("has no GST row or note on a quote without tax", async () => {
    const quote = await aQuote({ taxRateBasisPoints: 0, placeOfSupply: null }, false);
    const issued = await world.inOrg((tx) => issueQuotePdf(tx, world.manager, quote.id, context));
    const stored = await world.inOrg((tx) => tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.documentId } }));
    const { data } = issuedDocumentRenderInput.parse(stored.renderInput);
    expect(data).toMatchObject({ total: "₹8,000", lines: [{ amount: "₹8,000" }] });
    expect(data).not.toHaveProperty("gst");
    expect(data).not.toHaveProperty("totalNote");
  });

  it("issues a quote with long lists with every point whole", async () => {
    const short = Array.from({ length: 150 }, (_, index) => `Point ${String(index + 1)}`);
    const long = `Long ${"word ".repeat(118)}end`;
    const quote = await aQuote({ inclusions: [...short, long].join("\n") }, false);
    const issued = await world.inOrg((tx) => issueQuotePdf(tx, world.manager, quote.id, context));
    const stored = await world.inOrg((tx) => tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.documentId } }));
    const { data } = issuedDocumentRenderInput.parse(stored.renderInput);
    if (!("inclusions" in data)) throw new Error("Not a quotation");
    expect(data.inclusions).toEqual([...short, long]);
    expect(long.length).toBeGreaterThan(590);
  });

  it("keeps the invoice on the sample template with its CGST and SGST rows", async () => {
    const quote = await aQuote();
    await world.inOrg(async (tx) => {
      await setQuoteStatus(tx, world.manager, { quoteId: quote.id, status: "sent" }, context.now, "27");
      await setQuoteStatus(tx, world.manager, { quoteId: quote.id, status: "accepted" }, context.now, "27");
    });
    const invoice = await world.inOrg((tx) => issueQuoteInvoice(tx, world.manager, quote.id, context));
    const stored = await world.inOrg((tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: invoice.documentId } }),
    );
    expect(stored.template).toBe("sample");
    expect(JSON.stringify(stored.renderInput)).toMatch(/CGST/);
  });
});
