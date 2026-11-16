// The AI's calendar: today and the weeks ahead in the agency's zone.
import { describe, expect, it } from "vitest";
import { calendarText } from "../../src/ai/calendar.js";

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
});
