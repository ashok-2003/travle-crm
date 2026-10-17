// @vitest-environment node
// "Later today" for the work journeys (agency-clock.ts): a time strictly later today on the agency's clock (India). The
// day's last few minutes have none, so a journey waits for the new day; that wait stays short, well inside the
// journeys' 10-minute global timeout, so a run started near midnight in India (about 18:20 UTC) doesn't fail.
import { describe, expect, it } from "vitest";
import { laterTodayAt } from "./agency-clock";

/** A moment given as India's wall clock (UTC+5:30). */
const inIndia = (day: string, time: string) => new Date(`${day}T${time}+05:30`);

describe("laterTodayAt", () => {
  it("gives a time the asked minutes on, today, in the middle of the day", () => {
    expect(laterTodayAt(inIndia("2026-10-16", "11:00:00"), 90)).toEqual({ due: { on: "2026-10-16", at: "12:30" } });
  });

  it("still finds a time today ten minutes before midnight, rather than waiting for the new day", () => {
    const later = laterTodayAt(inIndia("2026-10-16", "23:50:00"), 90);
    expect("due" in later ? later.due.on : "a wait").toBe("2026-10-16");
    expect("due" in later ? later.due.at : "a wait").toMatch(/^23:5\d$/);
  });

  it("waits at most a few minutes in the day's very last ones, until just past midnight", () => {
    const wait = laterTodayAt(inIndia("2026-10-16", "23:57:30"), 90);
    expect("waitMs" in wait).toBe(true);
    const waitMs = "waitMs" in wait ? wait.waitMs : 0;
    expect(waitMs).toBeLessThanOrEqual(3 * 60_000);
    expect(inIndia("2026-10-16", "23:57:30").getTime() + waitMs).toBeGreaterThan(
      inIndia("2026-10-17", "00:00:00").getTime(),
    );
  });
});
