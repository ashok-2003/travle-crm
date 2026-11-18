// How many things My tasks holds: overdue, due today, new leads, payments to check (a claim and its task once), and
// the payments due and trip details sections that stay on it until the Bookings redesign.
import { describe, expect, it } from "vitest";
import { myTasksTotal, type TodaySummary } from "../../src/today/today.js";

const counts = (parts: Partial<TodaySummary["counts"]>): TodaySummary["counts"] => ({
  overdue: 0,
  newLeads: 0,
  dueToday: 0,
  followUpsDue: 0,
  quoteOpened: 0,
  paymentsDue: 0,
  tripDetails: 0,
  departures: 0,
  paymentsToCheck: 0,
  checkTasks: 0,
  ...parts,
});

describe("myTasksTotal", () => {
  it("counts payments due and trips missing details, and leaves out follow-ups, quotes and departures", () => {
    expect(
      myTasksTotal(
        counts({
          overdue: 2,
          dueToday: 3,
          newLeads: 1,
          paymentsDue: 4,
          tripDetails: 2,
          followUpsDue: 9,
          quoteOpened: 5,
          departures: 6,
        }),
      ),
    ).toBe(12);
  });

  it("counts a claim waiting for its check once, not again as its task", () => {
    expect(myTasksTotal(counts({ dueToday: 1, paymentsToCheck: 2, checkTasks: 1 }))).toBe(2);
  });
});
