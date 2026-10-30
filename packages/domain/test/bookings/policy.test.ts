// The cancellation policy's arithmetic (release 6, spec 2.9): which step a cancellation falls in, the charge as a share of the
// trip's total including GST, and a refund that is never negative.
import { describe, expect, it } from "vitest";
import { cancellationCosts, daysBefore, ruleFor } from "../../src/bookings/policy.js";

const policy = {
  notes: "",
  rules: [
    { daysBeforeMin: 0, chargeBasisPoints: 10_000 },
    { daysBeforeMin: 15, chargeBasisPoints: 2_500 },
    { daysBeforeMin: 30, chargeBasisPoints: 1_000 },
  ],
};
const day = (text: string) => new Date(`${text}T00:00:00Z`);

describe("which step a cancellation falls in", () => {
  it("counts whole days from the cancellation day to departure", () => {
    expect(daysBefore(day("2026-12-10"), day("2026-11-10"))).toBe(30);
    expect(daysBefore(day("2026-12-10"), day("2026-12-10"))).toBe(0);
    expect(daysBefore(day("2026-12-10"), day("2026-12-12"))).toBe(-2);
    expect(daysBefore(null, day("2026-12-12"))).toBeNull();
  });

  it("takes the step starting furthest out that is not further out than the days left", () => {
    expect(ruleFor(policy.rules, 45).chargeBasisPoints).toBe(1_000);
    expect(ruleFor(policy.rules, 30).chargeBasisPoints).toBe(1_000);
    expect(ruleFor(policy.rules, 29).chargeBasisPoints).toBe(2_500);
    expect(ruleFor(policy.rules, 15).chargeBasisPoints).toBe(2_500);
    expect(ruleFor(policy.rules, 14).chargeBasisPoints).toBe(10_000);
    expect(ruleFor(policy.rules, 0).chargeBasisPoints).toBe(10_000);
  });

  it("charges the nearest step for a trip past its day or with no date", () => {
    expect(ruleFor(policy.rules, -3).chargeBasisPoints).toBe(10_000);
    expect(ruleFor(policy.rules, null).chargeBasisPoints).toBe(10_000);
  });
});

describe("the charge and the refund", () => {
  const costs = (overrides: Partial<Parameters<typeof cancellationCosts>[0]>) =>
    cancellationCosts({
      policy,
      departure: day("2026-12-10"),
      cancelledOn: day("2026-11-10"),
      totalPaise: 100_000_00,
      paidPaise: 30_000_00,
      ...overrides,
    });

  it("charges a share of the total and refunds what was paid beyond it", () => {
    expect(costs({})).toMatchObject({
      daysBefore: 30,
      chargeBasisPoints: 1_000,
      chargePaise: 10_000_00,
      refundPaise: 20_000_00,
    });
  });

  it("never refunds less than nothing when the charge is more than was paid", () => {
    expect(costs({ cancelledOn: day("2026-12-05"), paidPaise: 30_000_00 })).toMatchObject({
      chargePaise: 100_000_00,
      refundPaise: 0,
    });
  });

  it("takes a changed charge in place of the worked-out one", () => {
    expect(costs({ chargeOverridePaise: 5_000_00 })).toMatchObject({ chargePaise: 5_000_00, refundPaise: 25_000_00 });
  });

  it("rounds a share of an odd total to the paisa", () => {
    expect(costs({ totalPaise: 33_333, paidPaise: 33_333 })).toMatchObject({ chargePaise: 3_333, refundPaise: 30_000 });
  });
});
