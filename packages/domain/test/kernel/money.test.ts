// Money is integer paise: arithmetic never loses or invents a paisa, rounding is explicit, and bad amounts are refused.
import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  formatMoney,
  fractionOf,
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

describe("fixes after review", () => {
  const MAX = Number.MAX_SAFE_INTEGER;

  it("has one zero, never -0", () => {
    expect(Object.is(money(-0).amountPaise, 0)).toBe(true);
    expect(Object.is(negate(money(0)).amountPaise, 0)).toBe(true);
    expect(Object.is(multiply(money(-100), 0).amountPaise, 0)).toBe(true);
  });

  it("gives leftover paise to the largest remainders, ties to the earlier part", () => {
    // 3 paise over 1:1:10 is 0.25, 0.25 and 2.5: the spare paisa goes to the third part, not the first.
    expect(allocate(money(3), [1, 1, 10])).toEqual([money(0), money(0), money(3)]);
    expect(sum(allocate(money(MAX), [1, 2, 3, 4]))).toEqual(money(MAX));
  });

  it("keeps zero-weight parts at nothing and breaks ties toward the earlier part", () => {
    expect(allocate(money(7), [0, 1, 0, 1])).toEqual([money(0), money(4), money(0), money(3)]);
  });

  it("refuses fractionOf with a bad denominator or numerator", () => {
    expect(() => fractionOf(money(100), 1, 0)).toThrow(RangeError);
    expect(() => fractionOf(money(100), 1, -3)).toThrow(RangeError);
    expect(() => fractionOf(money(100), 1.5, 2)).toThrow(RangeError);
    expect(() => fractionOf(money(100), 1, 2.5)).toThrow(RangeError);
    expect(fractionOf(money(100), 1, 3)).toEqual(money(33));
  });

  it("refuses a percentage that overflows", () => {
    expect(() => percentageOf(money(MAX), 20_000)).toThrow(RangeError);
  });

  it("refuses mixed currencies in subtract, compare and sum", () => {
    const dollars = { amountPaise: 100, currency: "USD" } as unknown as ReturnType<typeof money>;
    expect(() => subtract(rupees(1), dollars)).toThrow(/currencies/);
    expect(() => compare(rupees(1), dollars)).toThrow(/currencies/);
    expect(() => sum([rupees(1), dollars])).toThrow(/currencies/);
  });

  it("sums exactly and checks the range once, at the end", () => {
    expect(sum([money(MAX), money(1), money(-1)])).toEqual(money(MAX));
    expect(() => sum([money(MAX), money(1)])).toThrow(RangeError);
  });

  it("multiplies by a negative quantity", () => {
    expect(multiply(money(250), -2)).toEqual(money(-500));
  });

  it("refuses a currency it doesn't know", () => {
    expect(() => money(500, "USD" as never)).toThrow(RangeError);
    expect(formatMoney(money(500))).toBe("₹5.00");
  });

  it("parses the largest amount and refuses one paisa more", () => {
    expect(parseRupees("90071992547409.91")).toEqual(money(MAX));
    expect(parseRupees("-90071992547409.91")).toEqual(money(-MAX));
    expect(() => parseRupees("90071992547409.92")).toThrow(RangeError);
  });

  it("follows the grammar for a lone minus, a missing whole part and leading zeros", () => {
    for (const bad of ["-", ".5", "-.5", "₹"]) expect(() => parseRupees(bad), bad).toThrow(RangeError);
    expect(parseRupees("007")).toEqual(money(700));
    expect(parseRupees("-0")).toEqual(money(0));
    expect(Object.is(parseRupees("-0").amountPaise, 0)).toBe(true);
  });

  it("refuses long text before reading it", () => {
    expect(() => parseRupees("1".repeat(41))).toThrow(RangeError);
    expect(parseRupees("1".repeat(14))).toEqual(money(1_111_111_111_111_100));
  });
});

describe("sum currency", () => {
  it("refuses an item in another currency than the one asked for", () => {
    const dollars = { amountPaise: 100, currency: "USD" } as unknown as ReturnType<typeof money>;
    expect(() => sum([dollars])).toThrow(/currencies/);
  });
});
