// A quote through its life: written only while a draft, replaced by a new version once sent; its payments due adding up;
// money recorded once, never beyond the total, and undone with its effects when voided; invoices numbered once whatever
// the taps; the customer's acceptance on the link. Against the real database, under row-level security.
import { randomUUID } from "node:crypto";
import type { CreateQuoteInput } from "@travel-crm/contracts/quotes";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { aLead } from "../crm/support/records.js";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  acceptQuoteFromLink,
  addInstallment,
  createQuote,
  getQuote,
  issuePaymentReceipt,
  issueQuoteInvoice,
  moneySummaryOf,
  newQuoteVersion,
  recordPayment,
  setQuoteStatus,
  updateQuote,
  voidPayment,
  type DocumentContext,
} from "../../src/quotes/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const documents: DocumentContext = {
  branding: { organizationName: "Sharma Holidays" },
  supplierStateCode: "27",
  gstin: "27ABCDE1234F1Z5",
  invoicePrefix: null,
  now: context.now,
};
const fields = (overrides: Partial<CreateQuoteInput> = {}): Omit<CreateQuoteInput, "leadId"> => ({
  title: "Manali",
  startDate: null,
  adults: 2,
  children: 0,
  days: [],
  items: [{ description: "Package", detail: "", quantity: 1, unitPricePaise: 1_000_000 }],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  placeOfSupply: null,
  ...overrides,
});
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("a quote through its life", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  /** A lead of the owner's and a draft quote on it (5% GST on ₹10,000: ₹10,500 in all). */
  async function aQuote(overrides: Partial<CreateQuoteInput> = {}) {
    return inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: owner.userId, stage: "contacted" });
      return createQuote(tx, owner, { leadId: lead.id, ...fields(overrides) }, context);
    });
  }
  const send = (quoteId: string) => inOrg((tx) => setQuoteStatus(tx, owner, { quoteId, status: "sent" }, context.now));
  const sent = async (overrides: Partial<CreateQuoteInput> = {}) => send((await aQuote(overrides)).id);
  const pay = (quoteId: string, amountPaise: number, requestId = randomUUID()) =>
    inOrg((tx) =>
      recordPayment(
        tx,
        owner,
        { quoteId, amountPaise, receivedOn: "2026-11-10", method: "upi", reference: "", requestId },
        context.now,
      ),
    );
  const stageOf = (leadId: string) =>
    inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } })).then((lead) => lead.stage);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 4 });
    organizationId = await createTestOrganization(platform, "Quote rules");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  describe("a sent quote keeps its prices", () => {
    it("is written while a draft, and refused once sent", async () => {
      const draft = await aQuote();
      const changed = await inOrg((tx) =>
        updateQuote(tx, owner, { quoteId: draft.id, ...fields({ title: "Manali 5 days" }) }, context),
      );
      expect(changed.title).toBe("Manali 5 days");
      await send(draft.id);
      const refusal = await reasonOf(
        inOrg((tx) => updateQuote(tx, owner, { quoteId: draft.id, ...fields({ title: "Cheaper" }) }, context)),
      );
      expect(refusal).toBe("QUOTE_FROZEN");
    });

    it("keeps the place of supply an edit sends, so IGST works", async () => {
      const draft = await aQuote({ placeOfSupply: "07" });
      const again = await inOrg((tx) =>
        updateQuote(tx, owner, { quoteId: draft.id, ...fields({ placeOfSupply: "07" }) }, context),
      );
      expect(again.placeOfSupply).toBe("07");
      expect(again.totals.taxPaise).toBe(50_000);
    });

    it("is replaced by a new version: a draft copy, the old one saying so", async () => {
      const old = await sent();
      await inOrg((tx) => addInstallmentOnDraftCopyCheck(tx, old.id));
      const draft = await inOrg((tx) => newQuoteVersion(tx, owner, old.id, context));
      expect(draft.status).toBe("draft");
      expect(draft.totals.totalPaise).toBe(old.totals.totalPaise);
      const replaced = await inOrg((tx) => getQuote(tx, owner, old.id));
      expect(replaced).toMatchObject({ status: "replaced", replacedById: draft.id });
    });

    async function addInstallmentOnDraftCopyCheck(tx: OrgTx, quoteId: string) {
      // The sent quote's payments due can't be changed either.
      await expect(
        addInstallment(tx, owner, { quoteId, label: "Advance", amountPaise: 1, dueOn: "2026-12-01" }),
      ).rejects.toMatchObject({ reason: "QUOTE_FROZEN" });
    }

    it("is not replaced once accepted, because an accepted quote is the booking", async () => {
      const quote = await sent();
      await pay(quote.id, 100_000);
      expect(await reasonOf(inOrg((tx) => newQuoteVersion(tx, owner, quote.id, context)))).toBe(
        "QUOTE_NOT_REPLACEABLE",
      );
    });
  });

  describe("payments due", () => {
    it("can't add up to more than the total, and must add up to it before the quote is sent", async () => {
      const draft = await aQuote();
      const add = (amountPaise: number) =>
        inOrg((tx) =>
          addInstallment(tx, owner, { quoteId: draft.id, label: "Part", amountPaise, dueOn: "2026-12-01" }),
        );
      await add(300_000);
      expect(await reasonOf(add(800_000))).toBe("INSTALLMENTS_EXCEED_TOTAL");
      expect(await reasonOf(send(draft.id))).toBe("INSTALLMENTS_MISMATCH");
      await add(750_000);
      expect((await send(draft.id)).status).toBe("sent");
    });
  });

  describe("payments", () => {
    it("are refused on a draft", async () => {
      const draft = await aQuote();
      expect(await reasonOf(pay(draft.id, 100_000))).toBe("QUOTE_NOT_SENT");
    });

    it("are refused beyond what is left to pay", async () => {
      const quote = await sent();
      await pay(quote.id, 1_000_000);
      expect(await reasonOf(pay(quote.id, 100_000))).toBe("PAYMENT_EXCEEDS_BALANCE");
      await pay(quote.id, 50_000);
      expect((await inOrg((tx) => getQuote(tx, owner, quote.id))).totals.balancePaise).toBe(0);
    });

    it("are recorded once for one request, whatever the taps", async () => {
      const quote = await sent();
      const requestId = randomUUID();
      const [first, second] = await Promise.all([pay(quote.id, 400_000, requestId), pay(quote.id, 400_000, requestId)]);
      expect(second.paymentId).toBe(first.paymentId);
      expect((await inOrg((tx) => getQuote(tx, owner, quote.id))).payments).toHaveLength(1);
    });

    it("never pass the total when two are recorded at once", async () => {
      const quote = await sent();
      const results = await Promise.allSettled([pay(quote.id, 700_000), pay(quote.id, 700_000)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect((await inOrg((tx) => getQuote(tx, owner, quote.id))).totals.paidPaise).toBe(700_000);
    });

    it("accept the quote and win the lead, and voiding the first puts both back", async () => {
      const quote = await sent();
      const { paymentId } = await pay(quote.id, 300_000);
      expect(await inOrg((tx) => getQuote(tx, owner, quote.id))).toMatchObject({ status: "accepted" });
      expect(await stageOf(quote.leadId)).toBe("won");
      await inOrg((tx) => voidPayment(tx, owner, paymentId, context.now));
      const back = await inOrg((tx) => getQuote(tx, owner, quote.id));
      expect(back).toMatchObject({ status: "sent", acceptedAt: null });
      expect(back.payments).toHaveLength(0);
      expect(await stageOf(quote.leadId)).toBe("quote_sent");
    });

    it("keep the quote accepted when only one of two is voided", async () => {
      const quote = await sent();
      await pay(quote.id, 300_000);
      const { paymentId } = await pay(quote.id, 200_000);
      await inOrg((tx) => voidPayment(tx, owner, paymentId, context.now));
      expect(await inOrg((tx) => getQuote(tx, owner, quote.id))).toMatchObject({ status: "accepted" });
      expect(await stageOf(quote.leadId)).toBe("won");
    });

    it("can't be voided once their receipt is issued", async () => {
      const quote = await sent();
      const { paymentId } = await pay(quote.id, 300_000);
      await inOrg((tx) => issuePaymentReceipt(tx, owner, paymentId, documents));
      expect(await reasonOf(inOrg((tx) => voidPayment(tx, owner, paymentId, context.now)))).toBe("PAYMENT_HAS_RECEIPT");
    });
  });

  describe("the invoice", () => {
    it("is numbered once when two taps arrive together", async () => {
      const quote = await sent();
      await pay(quote.id, 100_000);
      const [first, second] = await Promise.all([
        inOrg((tx) => issueQuoteInvoice(tx, owner, quote.id, documents)),
        inOrg((tx) => issueQuoteInvoice(tx, owner, quote.id, documents)),
      ]);
      expect(second).toEqual(first);
    });

    it("is refused with tax until the GSTIN is saved", async () => {
      const quote = await sent();
      await pay(quote.id, 100_000);
      const refusal = await reasonOf(
        inOrg((tx) => issueQuoteInvoice(tx, owner, quote.id, { ...documents, gstin: null })),
      );
      expect(refusal).toBe("GSTIN_REQUIRED");
    });

    it("is refused for a quote not accepted", async () => {
      const quote = await sent();
      expect(await reasonOf(inOrg((tx) => issueQuoteInvoice(tx, owner, quote.id, documents)))).toBe(
        "QUOTE_NOT_ACCEPTED",
      );
    });
  });

  describe("quoting with tax", () => {
    it("is refused until the agency's GST state is saved, never silently untaxed", async () => {
      const lead = await inOrg((tx) => aLead(tx, { ownerUserId: owner.userId }));
      const refusal = await reasonOf(
        inOrg((tx) =>
          createQuote(tx, owner, { leadId: lead.id, ...fields() }, { ...context, supplierStateCode: null }),
        ),
      );
      expect(refusal).toBe("GST_STATE_REQUIRED");
    });
  });

  describe("accepting on the customer's link", () => {
    const accept = (quoteId: string, name = "Priya Nair", optionId?: string) =>
      inOrg((tx) => acceptQuoteFromLink(tx, { organizationId, quoteId, name, optionId }, context.now));

    it("accepts a sent quote, declines the other options and moves the lead to Booking requested", async () => {
      const first = await sent();
      const second = await inOrg(async (tx) => {
        const row = await createQuote(
          tx,
          owner,
          { leadId: first.leadId, ...fields({ title: "Manali 4-star" }) },
          context,
        );
        return setQuoteStatus(tx, owner, { quoteId: row.id, status: "sent" }, context.now);
      });
      await accept(first.id, "Priya Nair", first.id);
      expect(await inOrg((tx) => getQuote(tx, owner, first.id))).toMatchObject({
        status: "accepted",
        acceptedName: "Priya Nair",
      });
      expect((await inOrg((tx) => getQuote(tx, owner, second.id))).status).toBe("declined");
      expect(await stageOf(first.leadId)).toBe("booking_requested");
    });

    it("says why when the quote was replaced, declined or not sent", async () => {
      const old = await sent();
      await inOrg((tx) => newQuoteVersion(tx, owner, old.id, context));
      expect(await reasonOf(accept(old.id))).toBe("QUOTE_REPLACED");
      const draft = await aQuote();
      expect(await reasonOf(accept(draft.id))).toBe("QUOTE_NOT_SENT");
      const declined = await sent();
      await inOrg((tx) => setQuoteStatus(tx, owner, { quoteId: declined.id, status: "declined" }, context.now));
      expect(await reasonOf(accept(declined.id))).toBe("QUOTE_DECLINED");
    });

    it("needs a name", async () => {
      const quote = await sent();
      expect(await reasonOf(accept(quote.id, "   "))).toBe("NAME_REQUIRED");
    });
  });

  describe("the money summary", () => {
    it("does not call a payment due today overdue", async () => {
      const draft = await aQuote();
      await inOrg((tx) =>
        addInstallment(tx, owner, { quoteId: draft.id, label: "All", amountPaise: 1_050_000, dueOn: "2026-11-10" }),
      );
      const quote = await send(draft.id);
      await pay(quote.id, 1);
      const summary = (today: string) =>
        inOrg((tx) => moneySummaryOf(tx, owner, { from: "2026-11-01", to: "2026-11-30", today }));
      expect((await summary("2026-11-10")).overdueCount).toBe(0);
      expect((await summary("2026-11-11")).overdueCount).toBeGreaterThan(0);
    });
  });
});
