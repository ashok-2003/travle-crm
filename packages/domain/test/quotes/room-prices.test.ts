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

function taxFor(supplierState: "27" | "07") {
  return (subtotalPaise: number) =>
    indiaGst.compute({
      supplierStateCode: "27",
      placeOfSupplyStateCode: supplierState,
      lines: [{ description: "Trip", sacCode: "998555", taxableValue: money(subtotalPaise), rateBasisPoints: 500 }],
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
  it("takes GST out so the quote's total is the price told", () => {
    const taxOf = taxFor("27");
    const subtotal = exTaxSubtotal(699_900, 500, taxOf);
    expect(subtotal + taxOf(subtotal)).toBe(699_900);
    for (const state of ["27", "07"] as const) {
      const tax = taxFor(state);
      for (let rupees = 1_000; rupees <= 50_000; rupees += 1) {
        const total = rupees * 100;
        const part = exTaxSubtotal(total, 500, tax);
        expect(Math.abs(part + tax(part) - total)).toBeLessThanOrEqual(2);
      }
    }
  });
});
