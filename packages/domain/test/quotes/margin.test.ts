// What a quote earns (release 7b), worked out in integer paise over the lines that have a cost: a margin below the agency's
// minimum warns, a line without a cost is counted and left out, figures are for whoever may see margins, and a selling price
// is the cost plus a markup rounded up to a whole rupee. No database: these are plain rules.
import type { QuoteItem } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { keepStoredCosts, marginOf, needsRateLines, settledItems, withoutCosts } from "../../src/quotes/margin.js";
import { quantityFor } from "../../src/quotes/package-quote.js";
import { sellingPrice } from "../../src/quotes/rate-pricing.js";

const line = (overrides: Partial<QuoteItem> = {}): QuoteItem => ({
  description: "Hotel",
  detail: "",
  quantity: 8,
  unitPricePaise: 385_000,
  costUnitPaise: 350_000,
  ...overrides,
});
const none = { minMarginBasisPoints: null, minMarginPerPersonPaise: null };

describe("the margin of a quote", () => {
  it("is the price less the cost, as a share of the price, floored to a basis point", () => {
    const margin = marginOf([line()], 4, none, true);
    expect(margin).toMatchObject({ pricedLines: 1, totalLines: 1, marginPaise: 280_000, marginBasisPoints: 909 });
    expect(margin.perPersonPaise).toBe(70_000);
    expect(margin.belowMinimum).toBe(false);
  });

  it("warns below the least share, and not at it", () => {
    expect(marginOf([line()], 4, { ...none, minMarginBasisPoints: 1200 }, true).belowMinimum).toBe(true);
    expect(marginOf([line()], 4, { ...none, minMarginBasisPoints: 909 }, true).belowMinimum).toBe(false);
  });

  it("warns below the least amount for each traveller", () => {
    const settings = { ...none, minMarginPerPersonPaise: 100_000 };
    expect(marginOf([line()], 4, settings, true).belowMinimum).toBe(true);
    expect(marginOf([line()], 2, settings, true).belowMinimum).toBe(false);
  });

  it("counts the lines with no cost and judges only the rest", () => {
    const items = [
      line(),
      line({ description: "Cab", unitPricePaise: 1_800_000, costUnitPaise: undefined, quantity: 1 }),
    ];
    const margin = marginOf(items, 4, { ...none, minMarginBasisPoints: 1200 }, true);
    expect(margin).toMatchObject({ pricedLines: 1, totalLines: 2, marginBasisPoints: 909 });
    expect(margin.belowMinimum).toBe(true);
  });

  it("judges nothing when no line has a cost, or the priced lines sell for nothing", () => {
    expect(
      marginOf([line({ costUnitPaise: undefined })], 4, { ...none, minMarginBasisPoints: 5000 }, true),
    ).toMatchObject({
      pricedLines: 0,
      belowMinimum: false,
      marginBasisPoints: null,
    });
    expect(
      marginOf([line({ unitPricePaise: 0, costUnitPaise: 0 })], 4, { ...none, minMarginBasisPoints: 5000 }, true)
        .belowMinimum,
    ).toBe(false);
    expect(marginOf([], 4, { ...none, minMarginBasisPoints: 5000 }, true).belowMinimum).toBe(false);
  });

  it("leaves a line that needs a rate out", () => {
    const margin = marginOf(
      [line(), line({ needsRate: true, unitPricePaise: 0, costUnitPaise: undefined })],
      4,
      none,
      true,
    );
    expect(margin.pricedLines).toBe(1);
    expect(needsRateLines([line(), line({ needsRate: true })])).toBe(1);
  });

  it("shows no figure to someone who may not see margins, but still says it is below", () => {
    const margin = marginOf([line()], 4, { ...none, minMarginBasisPoints: 1200 }, false);
    expect(margin).toMatchObject({
      belowMinimum: true,
      marginBasisPoints: null,
      marginPaise: null,
      perPersonPaise: null,
    });
  });

  it("goes negative when a line sells below its cost", () => {
    const margin = marginOf([line({ unitPricePaise: 300_000 })], 4, none, true);
    expect(margin.marginPaise).toBe(-400_000);
    expect(margin.marginBasisPoints).toBe(-1667);
  });
});

describe("a member who may not see costs", () => {
  it("reads lines without the cost or the rate", () => {
    const [read] = withoutCosts([line({ rateId: "9c0c1c3e-0000-4000-8000-000000000001" })]);
    expect(read).not.toHaveProperty("costUnitPaise");
    expect(read).not.toHaveProperty("rateId");
    expect(read?.unitPricePaise).toBe(385_000);
  });

  it("keeps the stored costs on the lines they were on when saving, and never takes one from the browser", () => {
    const stored = [
      line({ rateId: "9c0c1c3e-0000-4000-8000-000000000001" }),
      line({ description: "Cab", costUnitPaise: undefined }),
    ];
    const incoming = [
      line({ costUnitPaise: 1, unitPricePaise: 400_000 }),
      line({ description: "Cab", costUnitPaise: 5 }),
      line({ description: "New line", costUnitPaise: 7 }),
    ];
    const saved = keepStoredCosts(incoming, stored);
    expect(saved[0]).toMatchObject({ unitPricePaise: 400_000, costUnitPaise: 350_000 });
    expect(saved[0]?.rateId).toBe("9c0c1c3e-0000-4000-8000-000000000001");
    expect(saved[1]).not.toHaveProperty("costUnitPaise");
    expect(saved[2]).not.toHaveProperty("costUnitPaise");
  });

  it("drops the cost from a line whose words were rewritten", () => {
    const saved = keepStoredCosts([line({ description: "Another hotel" })], [line()]);
    expect(saved[0]).not.toHaveProperty("costUnitPaise");
  });
});

describe("a line that needs a rate", () => {
  it("is settled by a typed price, and stays while its price is zero", () => {
    const settled = settledItems([
      line({ needsRate: true, unitPricePaise: 400_000 }),
      line({ needsRate: true, unitPricePaise: 0 }),
    ]);
    expect(settled[0]).not.toHaveProperty("needsRate");
    expect(settled[1]?.needsRate).toBe(true);
  });
});

describe("a selling price", () => {
  it("is the cost at no markup", () => {
    expect(sellingPrice(350_000, 0)).toBe(350_000);
  });
  it("adds the markup, rounded up to a whole rupee", () => {
    expect(sellingPrice(350_000, 1000)).toBe(385_000);
    expect(sellingPrice(333_333, 1000)).toBe(333_333 + 33_400);
    expect(sellingPrice(100_001, 1)).toBe(100_001 + 100);
  });
});

describe("how many of a tier line a quote gets", () => {
  const party = { travellers: 5, nights: 5 };
  it("counts travellers, nights, room nights and person nights", () => {
    expect(quantityFor("fixed", 3, party)).toBe(3);
    expect(quantityFor("per_traveller", 3, party)).toBe(5);
    expect(quantityFor("per_night", 3, party)).toBe(5);
    expect(quantityFor("per_room_night", 3, party)).toBe(15);
    expect(quantityFor("per_person_night", 3, party)).toBe(25);
  });
  it("counts a day trip as one night and keeps to what a quote line holds", () => {
    expect(quantityFor("per_night", 1, { travellers: 2, nights: 0 })).toBe(1);
    expect(quantityFor("per_person_night", 1, { travellers: 500, nights: 60 })).toBe(1000);
    expect(quantityFor("per_traveller", 1, { travellers: 0, nights: 1 })).toBe(1);
  });
});
