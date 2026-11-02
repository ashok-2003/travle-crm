// Quote lines priced from rates (release 7b) against the real database, under row-level security: a line takes the cost of the
// rate for the quote's start date and sells at cost plus the agency's markup; "No rate for these dates" is an answer, not a
// guess; a member who may not see margins never reads or sets a cost but keeps the ones on the quote; a quote below the minimum
// margin sends and says so in its audit entry; a quote with a line that needs a rate does not send.
import { randomUUID } from "node:crypto";
import type { CreateQuoteInput, QuoteItem } from "@travel-crm/contracts/quotes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createQuote,
  duplicateQuote,
  getQuote,
  newQuoteVersion,
  priceLine,
  saveQuoteSettings,
  setQuoteStatus,
  updateQuote,
} from "../../src/quotes/index.js";
import { saveRate, saveSeason } from "../../src/suppliers/index.js";
import { createSupplier } from "../../src/suppliers/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";

const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
/** A quote's first line. */
function firstItem(quote: { items: QuoteItem[] }): QuoteItem {
  const [first] = quote.items;
  if (first === undefined) throw new Error("The quote has no lines");
  return first;
}
const fields = (items: QuoteItem[], overrides: Partial<CreateQuoteInput> = {}): Omit<CreateQuoteInput, "leadId"> => ({
  title: "Kedarnath",
  startDate: "2026-12-10",
  adults: 4,
  children: 0,
  days: [],
  items,
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 0,
  placeOfSupply: null,
  ...overrides,
});

describe("quote lines priced from rates", () => {
  let world: World;
  let rateId: string;
  beforeAll(async () => {
    world = await openWorld("Priced quotes");
    const supplier = await world.inOrg((tx) =>
      createSupplier(tx, world.manager, {
        kind: "hotel",
        name: "Hotel Aurora",
        city: "",
        gstin: "",
        paymentTerms: "",
        paymentDetails: "",
        notes: "",
      }),
    );
    const season = await world.inOrg((tx) =>
      saveSeason(tx, world.manager, {
        supplierId: supplier.id,
        label: "Peak",
        startsOn: "2026-12-01",
        endsOn: "2027-01-15",
      }),
    );
    rateId = (
      await world.inOrg((tx) =>
        saveRate(tx, world.manager, {
          seasonId: season.id,
          item: "Deluxe room",
          mealPlan: "MAP",
          occupancy: "double",
          unit: "per_room_night",
          costPaise: 350_000,
          note: "",
        }),
      )
    ).id;
    await settings({ markup: 1000, minimum: 1200 });
  });
  afterAll(async () => {
    await world.close();
  });

  const settings = (changes: { markup: number; minimum: number | null }) =>
    world.inOrg((tx) =>
      saveQuoteSettings(tx, world.manager, {
        upiId: "",
        upiName: "",
        defaultTaxRateBasisPoints: 0,
        defaultTerms: "",
        defaultMarkupBasisPoints: changes.markup,
        minMarginBasisPoints: changes.minimum,
        minMarginPerPersonPaise: null,
      }),
    );
  const pricedItem = async (quantity = 8, date = "2026-12-10"): Promise<QuoteItem> => {
    const line = await world.inOrg((tx) => priceLine(tx, { rateId, date, quantity }));
    return { ...line };
  };
  /** A draft on a lead of the salesperson's. */
  const aDraft = async (items: QuoteItem[], by = world.manager) =>
    world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      return createQuote(tx, by, { leadId: lead.id, ...fields(items) }, context);
    });

  it("takes the rate's cost for the start date and sells at the cost plus the markup", async () => {
    const line = await world.inOrg((tx) => priceLine(tx, { rateId, date: "2026-12-10", quantity: 8 }));
    expect(line).toMatchObject({
      quantity: 8,
      costUnitPaise: 350_000,
      unitPricePaise: 385_000,
      rateId,
      description: "Hotel Aurora: Deluxe room",
    });
    expect(line.detail).toContain("MAP");
    expect(line.detail).toContain("Peak");
  });

  it("says there is no rate for a date no season covers", async () => {
    expect(await reasonOf(world.inOrg((tx) => priceLine(tx, { rateId, date: "2027-04-01", quantity: 1 })))).toBe(
      "NO_RATE_FOR_DATES",
    );
  });

  it("sells at cost when the agency adds no markup", async () => {
    await settings({ markup: 0, minimum: 1200 });
    expect((await pricedItem(1)).unitPricePaise).toBe(350_000);
    await settings({ markup: 1000, minimum: 1200 });
  });

  it("shows the margin and its figures to whoever may see margins", async () => {
    const quote = await aDraft([await pricedItem()]);
    expect(quote.items[0]?.costUnitPaise).toBe(350_000);
    expect(quote.margin).toMatchObject({
      pricedLines: 1,
      totalLines: 1,
      belowMinimum: true,
      marginBasisPoints: 909,
      marginPaise: 280_000,
    });
  });

  it("shows a salesperson the warning and no cost, rate or figure", async () => {
    const made = await aDraft([await pricedItem()]);
    const read = await world.inOrg((tx) => getQuote(tx, world.seller, made.id));
    expect(read.items[0]).not.toHaveProperty("costUnitPaise");
    expect(read.items[0]).not.toHaveProperty("rateId");
    expect(read.margin).toMatchObject({
      belowMinimum: true,
      marginBasisPoints: null,
      marginPaise: null,
      perPersonPaise: null,
    });
    expect(read.items[0]?.unitPricePaise).toBe(385_000);
  });

  it("keeps the costs on a quote a salesperson saves, and takes none from them", async () => {
    const made = await aDraft([await pricedItem()]);
    const saved = await world.inOrg((tx) =>
      updateQuote(
        tx,
        world.seller,
        {
          quoteId: made.id,
          ...fields(
            [
              { ...firstItem(made), costUnitPaise: 1 },
              { description: "Cab", detail: "", quantity: 1, unitPricePaise: 900_000, costUnitPaise: 5 },
            ],
            {
              title: "Kedarnath, revised",
            },
          ),
        },
        context,
      ),
    );
    expect(saved.items[0]).not.toHaveProperty("costUnitPaise");
    // The owner still reads the cost the rate gave, and the cab has none.
    const owner = await world.inOrg((tx) => getQuote(tx, world.manager, made.id));
    expect(owner.items[0]?.costUnitPaise).toBe(350_000);
    expect(owner.items[1]?.costUnitPaise).toBeUndefined();
    expect(owner.margin.pricedLines).toBe(1);
    expect(owner.margin.totalLines).toBe(2);
  });

  it("takes no cost from a salesperson who makes a quote, but keeps them on a copy of one that has them", async () => {
    const item = await pricedItem();
    const typed = await world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      return createQuote(tx, world.seller, { leadId: lead.id, ...fields([item]) }, context);
    });
    expect((await world.inOrg((tx) => getQuote(tx, world.manager, typed.id))).items[0]?.costUnitPaise).toBeUndefined();
    const made = await aDraft([await pricedItem()]);
    const copy = await world.inOrg((tx) => duplicateQuote(tx, world.seller, made.id, context));
    expect((await world.inOrg((tx) => getQuote(tx, world.manager, copy.id))).items[0]?.costUnitPaise).toBe(350_000);
  });

  it("sends below the minimum margin, and the audit entry says so", async () => {
    const made = await aDraft([await pricedItem()]);
    const sent = await world.inOrg((tx) =>
      setQuoteStatus(tx, world.seller, { quoteId: made.id, status: "sent" }, context.now, "27"),
    );
    expect(sent.status).toBe("sent");
    const entry = await world.inOrg((tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "quote.status-changed", entityId: made.id } }),
    );
    expect(entry.after).toMatchObject({ status: "sent", belowMinimumMargin: true });
  });

  it("leaves the audit entry plain when the margin is enough", async () => {
    await settings({ markup: 1000, minimum: 500 });
    const made = await aDraft([await pricedItem()]);
    await world.inOrg((tx) =>
      setQuoteStatus(tx, world.seller, { quoteId: made.id, status: "sent" }, context.now, "27"),
    );
    const entry = await world.inOrg((tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "quote.status-changed", entityId: made.id } }),
    );
    expect(entry.after).toEqual({ status: "sent" });
    await settings({ markup: 1000, minimum: 1200 });
  });

  it("does not send a quote with a line that needs a rate, until it is priced", async () => {
    const made = await aDraft([
      await pricedItem(),
      { description: "Hotel in Sonprayag", detail: "", quantity: 5, unitPricePaise: 0, needsRate: true },
    ]);
    expect(made.needsRateLines).toBe(1);
    expect(
      await reasonOf(
        world.inOrg((tx) => setQuoteStatus(tx, world.seller, { quoteId: made.id, status: "sent" }, context.now, "27")),
      ),
    ).toBe("QUOTE_NEEDS_RATES");
    // A typed price settles it.
    const priced = await world.inOrg((tx) =>
      updateQuote(
        tx,
        world.seller,
        {
          quoteId: made.id,
          ...fields([
            { ...firstItem(made) },
            { description: "Hotel in Sonprayag", detail: "", quantity: 5, unitPricePaise: 400_000, needsRate: true },
          ]),
        },
        context,
      ),
    );
    expect(priced.needsRateLines).toBe(0);
    const sent = await world.inOrg((tx) =>
      setQuoteStatus(tx, world.seller, { quoteId: made.id, status: "sent" }, context.now, "27"),
    );
    expect(sent.status).toBe("sent");
  });

  it("keeps the costs when a sent quote is made again as a new version", async () => {
    const made = await aDraft([await pricedItem()]);
    await world.inOrg((tx) =>
      setQuoteStatus(tx, world.manager, { quoteId: made.id, status: "sent" }, context.now, "27"),
    );
    const version = await world.inOrg((tx) => newQuoteVersion(tx, world.seller, made.id, context));
    expect((await world.inOrg((tx) => getQuote(tx, world.manager, version.id))).items[0]?.costUnitPaise).toBe(350_000);
  });

  it("never lets a cost reach the customer's link", async () => {
    const { publicQuoteOf } = await import("../../src/quotes/index.js");
    const made = await aDraft([await pricedItem()]);
    const shown = await world.inOrg((tx) => publicQuoteOf(tx, made.id));
    expect(JSON.stringify(shown)).not.toContain("costUnitPaise");
    expect(JSON.stringify(shown)).not.toContain(rateId);
    expect(randomUUID()).toBeTruthy();
  });
});
