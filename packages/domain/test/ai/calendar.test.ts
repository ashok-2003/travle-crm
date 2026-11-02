// The AI's calendar: today and the weeks ahead in the agency's zone, the customer's wrong dates found, and a weekday the
// AI wrote beside a date made right before the reply goes.
import { describe, expect, it } from "vitest";
import { calendarText, dateChecks, fixWeekdays } from "../../src/ai/calendar.js";

// Monday 2 November 2026, 3:30 pm in India.
const now = new Date("2026-11-02T10:00:00Z");
const zone = "Asia/Kolkata";

describe("the AI's calendar", () => {
  it("says today, tomorrow and the day after in the agency's zone, and the weeks ahead from Monday", () => {
    const text = calendarText(now, zone);
    expect(text).toContain("Today is Monday, 2 Nov 2026");
    expect(text).toContain("Tomorrow (kal) is Tue 3 Nov; the day after (parso) is Wed 4 Nov.");
    expect(text).toContain("- Mon 2 Nov, Tue 3 Nov, Wed 4 Nov, Thu 5 Nov, Fri 6 Nov, Sat 7 Nov, Sun 8 Nov");
    expect(text).toContain("Dec 2026 starts on a Tuesday; Jan 2027 starts on a Friday");
    // Just before midnight in UTC is already the next day in India.
    expect(calendarText(new Date("2026-11-01T20:00:00Z"), zone)).toContain("Today is Monday, 2 Nov 2026");
  });

  it("finds a weekday that doesn't match its date, and names the nearest one", () => {
    expect(dateChecks("We want to leave Saturday 15 Nov", now, zone)).toEqual([
      'They wrote "15 Nov" with Saturday, but Sun 15 Nov 2026 is a Sunday; the nearest Saturday is Sat 14 Nov 2026. Point it out kindly with the right date and confirm which one they mean.',
    ]);
    expect(dateChecks("15th november (shanivar) ko nikalna hai", now, zone)).toHaveLength(1);
    expect(dateChecks("Saturday 14 Nov works", now, zone)).toEqual([]);
  });

  it("finds a date that doesn't exist, one already past, and one that passed this year", () => {
    expect(dateChecks("31 Nov please", now, zone)[0]).toMatch(/not a real date: Nov has 30 days/);
    expect(dateChecks("on 10/10/2026", now, zone)[0]).toMatch(/already past/);
    expect(dateChecks("around 5 Oct", now, zone)[0]).toMatch(/next one is Tue 5 Oct 2027/);
    expect(dateChecks("we are 4/5 people, 2 nights", now, zone)).toEqual([]);
  });

  it("puts right a weekday the AI wrote beside a date, in the same form", () => {
    expect(fixWeekdays("Great, Saturday 15 Nov it is!", now, zone)).toBe("Great, Sunday 15 Nov it is!");
    expect(fixWeekdays("Check-in 20 Nov (Thu), out Sat 22 Nov", now, zone)).toBe(
      "Check-in 20 Nov (Fri), out Sun 22 Nov",
    );
    expect(fixWeekdays("Shanivar 15 Nov ko pickup", now, zone)).toBe("Ravivar 15 Nov ko pickup");
    expect(fixWeekdays("Fri 20 Nov is fine", now, zone)).toBe("Fri 20 Nov is fine");
  });
});
