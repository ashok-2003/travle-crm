// What an organization pays per billing cycle (spec 7.2, the owner's pricing): the plan's price for its cycle and its
// extra seats', or the agreed price in their place, before GST; GST at 18 % on top, rounded half-up to the paisa.
import { describe, expect, it } from "vitest";
import { priceOf } from "../../src/subscriptions/index.js";

const growth = {
  monthlyPricePaise: 499_900,
  annualPricePaise: 4_999_000,
  extraSeatMonthlyPricePaise: 39_900,
  extraSeatAnnualPricePaise: 399_000,
};

describe("a subscription's price", () => {
  it("is the plan's for the billing cycle plus each extra seat's, with GST shown on top", () => {
    expect(priceOf(growth, { billingCycle: "annual", extraSeats: 3, customPricePaise: null })).toEqual({
      billingCycle: "annual",
      planPricePaise: 4_999_000,
      extraSeats: 3,
      extraSeatPricePaise: 399_000,
      listPricePaise: 6_196_000,
      customPricePaise: null,
      pricePaise: 6_196_000,
      gstRateBasisPoints: 1800,
      gstPaise: 1_115_280,
      totalPaise: 7_311_280,
    });
  });

  it("is the agreed price in place of the list price, and rounds GST half-up to the paisa", () => {
    // 18 % of ₹4,999.01 is ₹899.8218: ₹899.82.
    expect(priceOf(growth, { billingCycle: "monthly", extraSeats: 0, customPricePaise: 499_901 })).toMatchObject({
      listPricePaise: 499_900,
      pricePaise: 499_901,
      gstPaise: 89_982,
      totalPaise: 589_883,
    });
    // 18 % of 25 paise is 4.5 paise: 5.
    expect(priceOf(growth, { billingCycle: "monthly", extraSeats: 0, customPricePaise: 25 }).gstPaise).toBe(5);
  });
});
