// The plan form keeps plain text: rupees as people type them ("4,999", "1,250.50") and storage in GB, read into paise
// and bytes without a float. The api's own schema decides what's valid, and each problem is shown on its field.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { describe, expect, it } from "vitest";
import {
  gigabytesTextOf,
  planValues,
  toCreatePlanInput,
  toUpdatePlanInput,
  type PlanValues,
} from "@/console/plans/plan-values";

const GIGABYTE = 1024 ** 3;

const values: PlanValues = {
  key: "growth",
  name: "Growth",
  monthlyPrice: "4,999",
  yearlyPrice: "",
  extraSeatMonthlyPrice: "299.50",
  extraSeatYearlyPrice: "",
  seats: "10",
  whatsappNumbers: "2",
  storageGigabytes: "25",
  modules: ["crm", "quotes"],
};

const growth: PlanSummary = {
  id: "0199a000-0000-7000-8000-0000000000a1",
  key: "growth",
  name: "Growth",
  monthlyPricePaise: 499_900,
  yearlyPricePaise: 4_999_000,
  extraSeatMonthlyPricePaise: null,
  extraSeatYearlyPricePaise: 299_000,
  seatLimit: 10,
  whatsappNumberLimit: 2,
  // Not a whole number of GB: 1,000,000,000,000 bytes is 931.32 GB.
  storageLimitBytes: 1_000_000_000_000,
  modules: ["crm"],
  forSale: true,
  archived: false,
};

describe("toCreatePlanInput", () => {
  it("reads rupees into paise and GB into bytes, a blank price as not sold that way", () => {
    expect(toCreatePlanInput(values)).toEqual({
      ok: true,
      input: {
        key: "growth",
        name: "Growth",
        monthlyPricePaise: 499_900,
        yearlyPricePaise: null,
        extraSeatMonthlyPricePaise: 29_950,
        extraSeatYearlyPricePaise: null,
        seatLimit: 10,
        whatsappNumberLimit: 2,
        storageLimitBytes: 25 * GIGABYTE,
        modules: ["crm", "quotes"],
      },
    });
  });

  it("takes ₹ and spaces as typed, and a fraction of a GB", () => {
    const result = toCreatePlanInput({ ...values, monthlyPrice: " ₹12,50,000.5 ", storageGigabytes: "2.5" });
    expect(result).toMatchObject({
      ok: true,
      input: { monthlyPricePaise: 125_000_050, storageLimitBytes: 2.5 * GIGABYTE },
    });
  });

  it("asks for a monthly or a yearly price when both are blank", () => {
    expect(toCreatePlanInput({ ...values, monthlyPrice: "", yearlyPrice: " " })).toEqual({
      ok: false,
      problems: { monthlyPrice: "priceRequired" },
    });
  });

  it("puts each problem on its field", () => {
    expect(
      toCreatePlanInput({
        key: "Growth plan",
        name: " ",
        monthlyPrice: "4.999.00",
        yearlyPrice: "-10",
        extraSeatMonthlyPrice: "abc",
        extraSeatYearlyPrice: "3,00,00,000",
        seats: "0",
        whatsappNumbers: "2.5",
        storageGigabytes: "0",
        modules: [],
      }),
    ).toEqual({
      ok: false,
      problems: {
        key: "keyInvalid",
        name: "required",
        monthlyPrice: "priceInvalid",
        yearlyPrice: "priceInvalid",
        extraSeatMonthlyPrice: "priceInvalid",
        extraSeatYearlyPrice: "priceInvalid",
        seats: "seatsInvalid",
        whatsappNumbers: "whatsappInvalid",
        storageGigabytes: "storageInvalid",
      },
    });
  });
});

describe("toUpdatePlanInput", () => {
  it("sends everything but the key, which never changes", () => {
    const result = toUpdatePlanInput(growth, { ...values, key: "renamed" });
    expect(result).toMatchObject({ ok: true, input: { planId: growth.id, name: "Growth" } });
    expect(result.ok && "key" in result.input).toBe(false);
  });

  it("keeps the plan's exact storage when its GB weren't changed", () => {
    const shown = planValues(growth);
    expect(shown.storageGigabytes).toBe("931.32");
    expect(toUpdatePlanInput(growth, shown)).toMatchObject({
      ok: true,
      input: { storageLimitBytes: 1_000_000_000_000 },
    });
    expect(toUpdatePlanInput(growth, { ...shown, storageGigabytes: "931" })).toMatchObject({
      ok: true,
      input: { storageLimitBytes: 931 * GIGABYTE },
    });
  });
});

describe("planValues", () => {
  it("shows a plan as the form edits it", () => {
    expect(planValues(growth)).toEqual({
      key: "growth",
      name: "Growth",
      monthlyPrice: "4,999",
      yearlyPrice: "49,990",
      extraSeatMonthlyPrice: "",
      extraSeatYearlyPrice: "2,990",
      seats: "10",
      whatsappNumbers: "2",
      storageGigabytes: "931.32",
      modules: ["crm"],
    });
  });

  it("starts a new plan blank", () => {
    expect(planValues()).toEqual({
      key: "",
      name: "",
      monthlyPrice: "",
      yearlyPrice: "",
      extraSeatMonthlyPrice: "",
      extraSeatYearlyPrice: "",
      seats: "",
      whatsappNumbers: "",
      storageGigabytes: "",
      modules: [],
    });
  });
});

describe("the text of sizes", () => {
  it("shows GB to two decimals at most", () => {
    expect(gigabytesTextOf(25 * GIGABYTE)).toBe("25");
    expect(gigabytesTextOf(2.5 * GIGABYTE)).toBe("2.5");
    expect(gigabytesTextOf(1_000_000_000_000)).toBe("931.32");
  });
});
