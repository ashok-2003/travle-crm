// What a subscription costs per billing cycle (spec 7.2, the owner's pricing): the plan's flat price for its cycle, or
// the agreed one, plus each extra seat at the plan's seat price, before GST; GST at 18 % apart, rounded half-up to the
// paisa; and a plan is sold only the ways it is priced.
import { describe, expect, it } from "vitest";
import { assertSoldOn, subscriptionPriceOf } from "../../src/subscriptions/index.js";

const growth = {
  monthlyPricePaise: 499_900,
  yearlyPricePaise: 4_999_000,
  extraSeatMonthlyPricePaise: 29_900,
  extraSeatYearlyPricePaise: 299_000,
};

describe("a subscription's price", () => {
  it("is the flat price for the cycle and the extra seats at the plan's seat price, with GST apart", () => {
    // ₹4,999 and two seats at ₹299: ₹5,597.00, GST ₹1,007.46, ₹6,604.46 in all.
    expect(subscriptionPriceOf(growth, { billingCycle: "monthly", extraSeats: 2, customPricePaise: null })).toEqual({
      cycle: "monthly",
      basePaise: 499_900,
      extraSeats: 2,
      extraSeatsPaise: 59_800,
      subtotalPaise: 559_700,
      gstPaise: 100_746,
      totalPaise: 660_446,
    });
    expect(
      subscriptionPriceOf(growth, { billingCycle: "yearly", extraSeats: 2, customPricePaise: null }),
    ).toMatchObject({ subtotalPaise: 5_597_000, gstPaise: 1_007_460, totalPaise: 6_604_460 });
  });

  it("is the agreed price in place of the plan's, and rounds GST half-up to the paisa", () => {
    expect(
      subscriptionPriceOf(growth, { billingCycle: "monthly", extraSeats: 0, customPricePaise: 4_000_000 }),
    ).toMatchObject({ basePaise: 4_000_000, subtotalPaise: 4_000_000, gstPaise: 720_000 });
    // 18 % of 25 paise is 4.5 paise: 5.
    expect(
      subscriptionPriceOf(growth, { billingCycle: "monthly", extraSeats: 0, customPricePaise: 25 })?.gstPaise,
    ).toBe(5);
  });

  it("is none on a cycle the plan isn't sold on, without an agreed price; extra seats it doesn't sell cost nothing", () => {
    const monthlyOnly = { ...growth, yearlyPricePaise: null, extraSeatYearlyPricePaise: null };
    expect(subscriptionPriceOf(monthlyOnly, { billingCycle: "yearly", extraSeats: 1, customPricePaise: null })).toBe(
      null,
    );
    expect(
      subscriptionPriceOf(monthlyOnly, { billingCycle: "yearly", extraSeats: 1, customPricePaise: 1_000_000 }),
    ).toMatchObject({ basePaise: 1_000_000, extraSeatsPaise: 0 });
    expect(() => {
      assertSoldOn(monthlyOnly, "yearly");
    }).toThrow(expect.objectContaining({ reason: "NOT_SOLD_YEARLY" }));
    expect(() => {
      assertSoldOn({ ...growth, monthlyPricePaise: null }, "monthly");
    }).toThrow(expect.objectContaining({ reason: "NOT_SOLD_MONTHLY" }));
  });
});
