// What a subscription costs per billing cycle (spec 7.2, the owner's pricing): the plan's flat price for its cycle, or
// the agreed one, plus each extra seat at the plan's seat price, before GST; GST at 18 % apart as CGST and SGST, split
// as the kernel's GST engine splits a line, so the halves always add up; and a plan is sold only the ways it is priced.
import { describe, expect, it } from "vitest";
import { indiaGst, money } from "../../src/kernel/index.js";
import { assertSoldOn, subscriptionPriceOf } from "../../src/subscriptions/index.js";

const growth = {
  monthlyPricePaise: 499_900,
  yearlyPricePaise: 4_999_000,
  extraSeatMonthlyPricePaise: 29_900,
  extraSeatYearlyPricePaise: 299_000,
};

const agreed = (customPricePaise: number) =>
  subscriptionPriceOf(growth, { billingCycle: "monthly", extraSeats: 0, customPricePaise });

describe("a subscription's price", () => {
  it("is the flat price for the cycle and the extra seats at the plan's seat price, with GST apart", () => {
    // ₹4,999 and two seats at ₹299: ₹5,597.00, CGST and SGST ₹503.73 each, ₹6,604.46 in all.
    expect(subscriptionPriceOf(growth, { billingCycle: "monthly", extraSeats: 2, customPricePaise: null })).toEqual({
      cycle: "monthly",
      basePaise: 499_900,
      extraSeats: 2,
      extraSeatsPaise: 59_800,
      subtotalPaise: 559_700,
      cgstPaise: 50_373,
      sgstPaise: 50_373,
      gstPaise: 100_746,
      totalPaise: 660_446,
    });
    expect(
      subscriptionPriceOf(growth, { billingCycle: "yearly", extraSeats: 2, customPricePaise: null }),
    ).toMatchObject({ subtotalPaise: 5_597_000, gstPaise: 1_007_460, totalPaise: 6_604_460 });
  });

  it("is the agreed price in place of the plan's", () => {
    expect(agreed(4_000_000)).toMatchObject({ basePaise: 4_000_000, subtotalPaise: 4_000_000, gstPaise: 720_000 });
  });

  it("splits GST into halves that add up, even where each half rounds on its own", () => {
    // 18 % of 25 paise is 4.5 paise, but each 9 % is 2.25 paise: 2 and 2, so GST is 4 and the total 29.
    expect(agreed(25)).toMatchObject({ cgstPaise: 2, sgstPaise: 2, gstPaise: 4, totalPaise: 29 });
    // 9 % of 50 paise is 4.5: half-up to 5 each.
    expect(agreed(50)).toMatchObject({ cgstPaise: 5, sgstPaise: 5, gstPaise: 10 });
    for (const subtotalPaise of [1, 3, 25, 50, 99, 4_999_01, 559_700, 1_234_567]) {
      const invoice = indiaGst.compute({
        supplierStateCode: "27",
        placeOfSupplyStateCode: "27",
        lines: [
          { description: "Subscription", sacCode: "998439", taxableValue: money(subtotalPaise), rateBasisPoints: 1800 },
        ],
      });
      const price = agreed(subtotalPaise);
      expect([price.cgstPaise, price.sgstPaise], String(subtotalPaise)).toEqual(
        invoice.components.map((component) => component.amount.amountPaise),
      );
      expect(price.gstPaise, String(subtotalPaise)).toBe(invoice.tax.amountPaise);
      expect(price.totalPaise, String(subtotalPaise)).toBe(invoice.total.amountPaise);
    }
  });

  it("refuses a cycle the plan isn't sold on without an agreed price; extra seats it doesn't sell cost nothing", () => {
    const monthlyOnly = { ...growth, yearlyPricePaise: null, extraSeatYearlyPricePaise: null };
    expect(() =>
      subscriptionPriceOf(monthlyOnly, { billingCycle: "yearly", extraSeats: 1, customPricePaise: null }),
    ).toThrow(expect.objectContaining({ code: "VALIDATION", reason: "NOT_SOLD_YEARLY" }));
    expect(
      subscriptionPriceOf(monthlyOnly, { billingCycle: "yearly", extraSeats: 1, customPricePaise: 1_000_000 }),
    ).toMatchObject({ basePaise: 1_000_000, extraSeatsPaise: 0 });
    expect(() => {
      assertSoldOn({ ...growth, monthlyPricePaise: null }, "monthly");
    }).toThrow(expect.objectContaining({ reason: "NOT_SOLD_MONTHLY" }));
  });
});
