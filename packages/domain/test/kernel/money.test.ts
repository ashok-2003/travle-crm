// Money is integer paise: arithmetic never loses or invents a paisa, rounding is explicit, and bad amounts are refused.
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  percentageOf,
  subtract,
  sum,
} from "../../src/kernel/index.js";

const rupees = (value: number) => money(value * 100);

describe("money", () => {
  it("holds whole paise in rupees", () => {
    expect(money(125_000_050)).toEqual({ amountPaise: 125_000_050, currency: "INR" });
    expect(Object.isFrozen(money(1))).toBe(true);
  });

  it("refuses fractions of a paisa, NaN and amounts too large to hold exactly", () => {
    for (const bad of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => money(bad)).toThrow(RangeError);
    }
  });

  it("adds, subtracts, negates and sums", () => {
    expect(add(rupees(100), money(50))).toEqual(money(10_050));
    expect(subtract(rupees(100), rupees(250))).toEqual(rupees(-150));
    expect(negate(rupees(5))).toEqual(rupees(-5));
    expect(sum([rupees(1), rupees(2), money(3)])).toEqual(money(303));
    expect(sum([])).toEqual(money(0));
  });

  it("multiplies by whole quantities only", () => {
    expect(multiply(money(12_345), 3)).toEqual(money(37_035));
    expect(() => multiply(money(100), 1.5)).toThrow(RangeError);
  });

  it("refuses a result too large to hold exactly", () => {
    expect(() => add(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(RangeError);
    expect(() => multiply(money(Number.MAX_SAFE_INTEGER), 2)).toThrow(RangeError);
  });

  it("compares and recognises zero", () => {
    expect(compare(rupees(1), rupees(2))).toBe(-1);
    expect(compare(rupees(2), rupees(2))).toBe(0);
    expect(compare(rupees(3), rupees(2))).toBe(1);
    expect(isZero(money(0))).toBe(true);
    expect(isZero(money(-1))).toBe(false);
  });

  it("refuses to mix currencies", () => {
    const dollars = { amountPaise: 100, currency: "USD" } as unknown as ReturnType<typeof money>;
    expect(() => add(rupees(1), dollars)).toThrow(/currencies/);
  });
});

describe("percentages and rounding", () => {
  it("takes a percentage in basis points, rounding half up (away from zero) by default", () => {
    // 5% of ₹100.10 is ₹5.005: half a paisa rounds up.
    expect(percentageOf(money(10_010), 500)).toEqual(money(501));
    expect(percentageOf(money(-10_010), 500)).toEqual(money(-501));
    // 18% of ₹999.99 is ₹179.9982.
    expect(percentageOf(money(99_999), 1800)).toEqual(money(18_000));
  });

  it("rounds half to even when asked", () => {
    expect(percentageOf(money(10_010), 500, "half-even")).toEqual(money(500));
    expect(percentageOf(money(10_030), 500, "half-even")).toEqual(money(502));
    expect(percentageOf(money(-10_010), 500, "half-even")).toEqual(money(-500));
  });

  it("keeps exact results exact, at any size", () => {
    expect(percentageOf(money(Number.MAX_SAFE_INTEGER - 1), 10_000)).toEqual(money(Number.MAX_SAFE_INTEGER - 1));
    expect(percentageOf(money(1), 0)).toEqual(money(0));
  });

  it("refuses rates that are not whole basis points", () => {
    expect(() => percentageOf(money(100), 2.5)).toThrow(RangeError);
  });
});

describe("allocation", () => {
  it("splits an amount without losing a paisa, the remainder to the first parts", () => {
    const parts = allocate(money(10_000), [1, 1, 1]);
    expect(parts).toEqual([money(3334), money(3333), money(3333)]);
    expect(sum(parts)).toEqual(money(10_000));
  });

  it("splits by ratios, and splits negative amounts the same way", () => {
    expect(allocate(money(1001), [70, 30])).toEqual([money(701), money(300)]);
    expect(allocate(money(-1001), [70, 30])).toEqual([money(-701), money(-300)]);
    expect(allocate(money(5), [0, 1])).toEqual([money(0), money(5)]);
  });

  it("refuses ratios that are empty, negative, fractional or all zero", () => {
    for (const ratios of [[], [-1, 2], [0.5, 0.5], [0, 0]]) {
      expect(() => allocate(money(100), ratios)).toThrow(RangeError);
    }
  });
});

describe("parseRupees", () => {
  it("reads typed amounts with Indian or international grouping, without going through floats", () => {
    expect(parseRupees("12,50,000.50")).toEqual(money(125_000_050));
    expect(parseRupees("1,250,000.5")).toEqual(money(125_000_050));
    expect(parseRupees("₹ 999")).toEqual(money(99_900));
    expect(parseRupees("0.07")).toEqual(money(7));
    expect(parseRupees("-500")).toEqual(money(-50_000));
  });

  it("refuses more than two decimals, stray characters and amounts too large", () => {
    for (const bad of ["12.345", "12,,000", "1,000,", "1,2,3", "abc", "", "12 34", "1e5", "99999999999999999"]) {
      expect(() => parseRupees(bad), bad).toThrow(RangeError);
    }
  });
});
