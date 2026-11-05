// Room prices: which prices apply on a date, a group's total by room type, and the pre-tax part of a GST-inclusive price.
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { indiaGst, money, parseCalendarDate } from "../../src/kernel/index.js";
import { exTaxSubtotal, priceOn, totalFor, type SeasonPrices } from "../../src/quotes/room-prices.js";

const day = parseCalendarDate;
const none: RoomPrices = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const all = ["single", "double", "triple", "quad", "child_bed", "child_no_bed"] as const;

const seasons: SeasonPrices[] = [
  { label: "Nov", startsOn: day("2026-11-01"), endsOn: day("2026-11-30"), prices: { ...none, triple: 699_900 } },
  { label: "Peak", startsOn: day("2026-12-20"), endsOn: day("2027-01-05"), prices: { ...none, triple: 799_900 } },
];

function taxFor(supplierState: "27" | "07", rateBasisPoints: number) {
  return (subtotalPaise: number) =>
    indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: supplierState,
      lines: [{ description: "Trip", sacCode: "998555", taxableValue: money(subtotalPaise), rateBasisPoints }],
    }).tax.amountPaise;
}

describe("priceOn", () => {
  it("prices a date on a season's first and last day, and none between seasons", () => {
    expect(priceOn(day("2026-11-01"), seasons, null, all)?.label).toBe("Nov");
    expect(priceOn(day("2026-11-30"), seasons, null, all)?.label).toBe("Nov");
    expect(priceOn(day("2026-12-10"), seasons, null, all)).toBeNull();
    expect(priceOn(day("2027-01-05"), seasons, null, all)?.label).toBe("Peak");
  });

  it("a batch's own prices win whole", () => {
    const departure = { title: "Premium, 27 Nov", prices: { ...none, double: 749_900 } };
    const priced = priceOn(day("2026-11-27"), seasons, departure, all);
    expect(priced).toMatchObject({ source: "departure", label: "Premium, 27 Nov" });
    expect(priced?.prices.double).toBe(749_900);
    expect(priced?.prices.triple).toBeNull();
  });

  it("room types not offered are not priced", () => {
    const both: SeasonPrices[] = [
      {
        label: "Nov",
        startsOn: day("2026-11-01"),
        endsOn: day("2026-11-30"),
        prices: { ...none, double: 800_000, triple: 699_900 },
      },
    ];
    const priced = priceOn(day("2026-11-10"), both, null, ["triple"]);
    expect(priced?.prices.double).toBeNull();
    expect(priced?.prices.triple).toBe(699_900);
  });
});

describe("totalFor", () => {
  it("totals by room, and refuses a split that doesn't fit", () => {
    const prices = { ...none, double: 800_000, triple: 699_900 };
    expect(totalFor(prices, [{ roomType: "triple", people: 3 }])).toMatchObject({ ok: true, totalPaise: 2_099_700 });
    expect(totalFor(prices, [{ roomType: "double", people: 3 }])).toEqual({
      ok: false,
      reason: "ROOM_SPLIT",
      roomType: "double",
    });
    expect(totalFor(prices, [{ roomType: "quad", people: 4 }])).toEqual({
      ok: false,
      reason: "NO_PRICE",
      roomType: "quad",
    });
  });
});

describe("exTaxSubtotal", () => {
  const sumFor = (tax: (subtotal: number) => number, subtotal: number) => subtotal + tax(subtotal);

  function checkTotals(rate: number, totals: Iterable<number>) {
    for (const state of ["27", "07"] as const) {
      const tax = taxFor(state, rate);
      for (const total of totals) {
        const part = exTaxSubtotal(total, rate, tax);
        const estimate = Math.round((total * 10_000) / (10_000 + rate));
        const reachable = [-2, -1, 0, 1, 2].some((offset) => sumFor(tax, estimate + offset) === total);
        // Exact whenever any subtotal near the estimate sums to the total; never more than 2 paise away.
        if (reachable) expect(sumFor(tax, part)).toBe(total);
        expect(total - sumFor(tax, part)).toBeGreaterThanOrEqual(0);
        expect(total - sumFor(tax, part)).toBeLessThanOrEqual(2);
      }
    }
  }

  it("takes GST out so the quote's total is the price told", () => {
    const taxOf = taxFor("27", 500);
    const subtotal = exTaxSubtotal(699_900, 500, taxOf);
    expect(sumFor(taxOf, subtotal)).toBe(699_900);
  });

  it("is exact where an exact subtotal exists, at 5 %, 12 % and 18 %, for whole rupees", () => {
    const rupees = Array.from({ length: 49_001 }, (_, index) => (1_000 + index) * 100);
    for (const rate of [500, 1200, 1800])
      checkTotals(
        rate,
        rupees.filter((_, index) => index % 7 === 0),
      );
    checkTotals(500, rupees);
  });

  it("is exact where possible for totals that are not whole rupees", () => {
    const paise = Array.from({ length: 4_000 }, (_, index) => 100_000 + index * 7);
    for (const rate of [500, 1200, 1800]) checkTotals(rate, paise);
  });

  it("picks the closest sum at or below the total when no subtotal sums exactly", () => {
    // A tax that rounds odd subtotals up to an even number can never reach a total of 4k + 1.
    const taxOf = (subtotal: number) => 2 * Math.round(subtotal / 2);
    expect(exTaxSubtotal(1_001, 10_000, taxOf)).toBe(500);
  });

  it("never goes above the total told, even when a sum above is as close", () => {
    // Odd subtotals gain one paise of tax: 1001 sums to 1002 (one above) and 1000 to 1000 (one below) for a total of 1001.
    const taxOf = (subtotal: number) => (subtotal % 2 === 0 ? 0 : 1);
    const part = exTaxSubtotal(1_001, 0, taxOf);
    expect(part).toBe(1_000);
    expect(part + taxOf(part)).toBeLessThanOrEqual(1_001);
  });

  it("refuses a tax function that cannot come near the total", () => {
    expect(() => exTaxSubtotal(1_000, 5_000, () => 0)).toThrow(Error);
  });
});
