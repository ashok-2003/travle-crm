// The agency's finance sums, worked by the database: bookings, GST, costs, profit, what customers owe and what suppliers
// are owed, a month at a time; costs only on an accepted quote; the bookings a page at a time, newest first.
import { randomUUID } from "node:crypto";
import { BOOKINGS_PAGE_SIZE } from "@travel-crm/contracts/finance";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { aLead } from "../crm/support/records.js";
import { addTripCost, financeSummaryOf, listBookings } from "../../src/finance/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { createQuote, recordPayment, setQuoteStatus } from "../../src/quotes/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-11-10T06:00:00Z");
const context = { supplierStateCode: "27", now };
const cost = (quoteId: string, amountPaise: number, paidOn: string | null = null) => ({
  quoteId,
  category: "hotel" as const,
  supplier: "Hotel Snow",
  amountPaise,
  dueOn: null,
  paidOn,
  note: "",
});

describe("finance", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  /** A quote of ₹10,000 plus 5% GST, sent; accepted by a payment of `paid` paise when given. */
  async function aBooking(paid: number | null, acceptedAt = now) {
    return inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: owner.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        owner,
        {
          leadId: lead.id,
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
        },
        context,
      );
      await setQuoteStatus(tx, owner, { quoteId: quote.id, status: "sent" }, acceptedAt);
      if (paid !== null) {
        await recordPayment(
          tx,
          owner,
          {
            quoteId: quote.id,
            amountPaise: paid,
            receivedOn: "2026-11-10",
            method: "upi",
            reference: "",
            requestId: randomUUID(),
          },
          acceptedAt,
        );
      }
      return quote;
    });
  }

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Finance sums");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("refuses a cost on a quote that is not accepted", async () => {
    const quote = await aBooking(null);
    await expect(inOrg((tx) => addTripCost(tx, owner, cost(quote.id, 100_000)))).rejects.toMatchObject({
      reason: "QUOTE_NOT_ACCEPTED",
    });
  });

  it("sums the period's bookings, costs, profit and what is owed, and the month's figures", async () => {
    const first = await aBooking(400_000);
    const second = await aBooking(1_050_000);
    await aBooking(null);
    await inOrg(async (tx) => {
      await addTripCost(tx, owner, cost(first.id, 300_000));
      await addTripCost(tx, owner, cost(second.id, 200_000, "2026-11-12"));
      await tx.agencyExpense.create({
        data: {
          category: "rent",
          amountPaise: 150_000n,
          spentOn: new Date("2026-11-05T00:00:00Z"),
          description: "Office",
        },
      });
    });
    const summary = await inOrg((tx) => financeSummaryOf(tx, { from: "2026-11-01", to: "2026-11-30" }, "Asia/Kolkata"));
    expect(summary).toMatchObject({
      bookings: 2,
      revenuePaise: 2_000_000,
      gstPaise: 100_000,
      tripCostPaise: 500_000,
      grossProfitPaise: 1_500_000,
      expensePaise: 150_000,
      netProfitPaise: 1_350_000,
      collectedPaise: 1_450_000,
      // The first booking still owes 1,050,000 - 400,000; the second owes nothing.
      receivablePaise: 650_000,
      payablePaise: 300_000,
    });
    expect(summary.expensesByCategory).toEqual([{ category: "rent", amountPaise: 150_000 }]);
    expect(summary.months.at(-1)).toMatchObject({
      month: "2026-11",
      revenuePaise: 2_000_000,
      tripCostPaise: 500_000,
      expensePaise: 150_000,
    });
  });

  it("lists bookings newest first, a page at a time, with no booking twice or missed", async () => {
    const total = BOOKINGS_PAGE_SIZE + 3;
    for (let index = 0; index < total; index += 1) await aBooking(100_000, new Date(now.getTime() + index * 1000));
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await inOrg((tx) => listBookings(tx, cursor === undefined ? {} : { cursor }));
      expect(page.items.length).toBeLessThanOrEqual(BOOKINGS_PAGE_SIZE);
      seen.push(...page.items.map((row) => row.quoteId));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined);
    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
    const accepted = await inOrg((tx) => tx.quote.count({ where: { status: "accepted" } }));
    expect(seen).toHaveLength(accepted);
  });

  it("cuts the period and the months in the agency's time zone", async () => {
    // 20:00 UTC on 31 October is 01:30 on 1 November in India.
    await aBooking(100_000, new Date("2026-10-31T20:00:00Z"));
    const november = await inOrg((tx) =>
      financeSummaryOf(tx, { from: "2026-11-01", to: "2026-11-01" }, "Asia/Kolkata"),
    );
    const october = await inOrg((tx) => financeSummaryOf(tx, { from: "2026-10-31", to: "2026-10-31" }, "Asia/Kolkata"));
    expect(november.bookings).toBeGreaterThan(0);
    expect(october.bookings).toBe(0);
  });
});
