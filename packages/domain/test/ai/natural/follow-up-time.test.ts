// Where the natural agent's planned follow-up lands (G7): read on the agency's clock, moved into waking hours (9 am to
// 9 pm), kept inside WhatsApp's window less its margin, or refused with the way on.
import type { FollowUpWhen } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { placeFollowUp } from "../../../src/ai/natural/tools/follow-up-time.js";
import { instantAt, parseCalendarDate, parseTimeOfDay } from "../../../src/kernel/index.js";

const india = "Asia/Kolkata";
const conversationId = "0199e7a0-0000-7000-8000-0000000000c2";
/** The instant Kolkata's clocks show `time` on `day`. */
const at = (day: string, time: string) => instantAt(parseCalendarDate(day), parseTimeOfDay(time), india);

/** Where `when` lands at `now`, for a customer who wrote a minute before (or at `lastInboundAt`). */
function place(when: FollowUpWhen, now: Date, options: { date?: string; lastInboundAt?: Date } = {}) {
  return placeFollowUp({
    when,
    date: options.date === undefined ? null : parseCalendarDate(options.date),
    now,
    lastInboundAt: options.lastInboundAt ?? new Date(now.getTime() - 60_000),
    timeZone: india,
    conversationId,
  });
}

describe("placeFollowUp", () => {
  it("places this evening at 6 pm in the agency's zone", () => {
    // 12:30 am on Sun 15 Nov in Kolkata is still Sat 14 Nov in UTC: this evening is Sunday's.
    expect(place("this_evening", at("2026-11-15", "00:30"))).toEqual(at("2026-11-15", "18:00"));
    expect(place("this_evening", at("2026-11-14", "12:00"))).toEqual(at("2026-11-14", "18:00"));
    expect(place("tomorrow_morning", at("2026-11-14", "12:00"))).toEqual(at("2026-11-15", "10:00"));
    expect(place("tomorrow_evening", at("2026-11-14", "20:00"))).toEqual(at("2026-11-15", "18:00"));
    expect(place("on_date", at("2026-11-14", "20:00"), { date: "2026-11-15" })).toEqual(at("2026-11-15", "10:00"));
    expect(place("in_a_few_hours", at("2026-11-14", "12:00"))).toEqual(at("2026-11-14", "15:00"));
  });

  it("refuses this evening once 6 pm has passed on the agency's clock", () => {
    expect(place("this_evening", at("2026-11-14", "23:43"))).toEqual({
      refused: "refused: it's past 6 pm already; use tomorrow_morning",
    });
    expect(place("this_evening", at("2026-11-14", "18:00"))).toEqual({
      refused: "refused: it's past 6 pm already; use tomorrow_morning",
    });
  });

  it("refuses a day that isn't after today", () => {
    const sooner = "refused: on_date needs a day after today (Sat 14 Nov); for sooner, use in_a_few_hours";
    expect(place("on_date", at("2026-11-14", "08:00"), { date: "2026-11-14" })).toEqual({ refused: sooner });
    expect(place("on_date", at("2026-11-14", "08:00"), { date: "2026-11-13" })).toEqual({ refused: sooner });
  });

  it("moves a time past 9 pm to 9 am, inside the window", () => {
    expect(place("in_a_few_hours", at("2026-11-14", "19:00"))).toEqual(at("2026-11-15", "09:00"));
    expect(place("in_a_few_hours", at("2026-11-14", "23:43"))).toEqual(at("2026-11-15", "09:00"));
    // Before 9 am goes to 9 am that day.
    expect(place("in_a_few_hours", at("2026-11-14", "03:00"))).toEqual(at("2026-11-14", "09:00"));
    // In whole minutes.
    expect(place("in_a_few_hours", new Date(at("2026-11-14", "12:00").getTime() + 30_000))).toEqual(
      at("2026-11-14", "15:00"),
    );
  });

  it("refuses a date past the window, naming the call_back task", () => {
    // The customer wrote at 2:58 pm: a follow-up may go until 1:58 pm the next day (the window less its hour).
    const lastInboundAt = at("2026-11-14", "14:58");
    const pastWindow = {
      refused:
        "refused: past the WhatsApp window (it ends Sun 15 Nov, 1:58 pm); for a later check-back, " +
        "create_task(kind: call_back, call_at: …)",
    };
    const now = at("2026-11-14", "15:00");
    expect(place("tomorrow_evening", now, { lastInboundAt })).toEqual(pastWindow);
    expect(place("on_date", now, { date: "2026-11-20", lastInboundAt })).toEqual(pastWindow);
    expect(place("tomorrow_morning", now, { lastInboundAt })).toEqual(at("2026-11-15", "10:00"));
    // Moved out of the night, a time can pass the window too.
    expect(place("in_a_few_hours", at("2026-11-14", "20:00"), { lastInboundAt: at("2026-11-13", "22:00") })).toEqual({
      refused:
        "refused: past the WhatsApp window (it ends Sat 14 Nov, 9 pm); for a later check-back, " +
        "create_task(kind: call_back, call_at: …)",
    });
  });

  it("answers null for none", () => {
    expect(place("none", at("2026-11-14", "23:43"))).toBeNull();
  });
});
