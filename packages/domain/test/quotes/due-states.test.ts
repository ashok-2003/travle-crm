// A payment due's state (paid, due, overdue) and a booking's payment state, worked out once in the domain.
import { describe, expect, it } from "vitest";
import { dueStatesOf, paymentStateOf } from "../../src/quotes/due-states.js";

const today = "2026-11-27" as never;
const dues = [
  { id: "a", amountPaise: 100, dueOn: "2026-11-26" },
  { id: "b", amountPaise: 100, dueOn: "2026-11-27" },
  { id: "c", amountPaise: 100, dueOn: "2026-11-28" },
];

describe("dueStatesOf", () => {
  it("reads a due today as due, yesterday's as overdue", () => {
    const states = dueStatesOf(dues, 0, today);
    expect(states.get("a")).toBe("overdue");
    expect(states.get("b")).toBe("due");
    expect(states.get("c")).toBe("due");
  });

  it("reads a covered due as paid whatever its day, earliest first", () => {
    const states = dueStatesOf(dues, 200, today);
    expect([states.get("a"), states.get("b"), states.get("c")]).toEqual(["paid", "paid", "due"]);
  });
});

describe("paymentStateOf", () => {
  it("says nothing, part_paid, overdue or paid", () => {
    expect(paymentStateOf({ paidPaise: 0, balancePaise: 300, anyOverdue: false })).toBe("nothing");
    expect(paymentStateOf({ paidPaise: 50, balancePaise: 250, anyOverdue: false })).toBe("part_paid");
    expect(paymentStateOf({ paidPaise: 50, balancePaise: 250, anyOverdue: true })).toBe("overdue");
    expect(paymentStateOf({ paidPaise: 0, balancePaise: 300, anyOverdue: true })).toBe("overdue");
    expect(paymentStateOf({ paidPaise: 300, balancePaise: 0, anyOverdue: false })).toBe("paid");
  });
});
