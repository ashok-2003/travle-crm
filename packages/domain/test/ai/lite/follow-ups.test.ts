// When the lite agent's two follow-ups go (plan 3b, Task 1): about 4 hours after its reply and about 20 hours after the
// customer's last message, 9 am to 9 pm in the agency's time zone, inside WhatsApp's 24-hour window less its 1-hour
// margin, and what each turn leaves for them.
import { describe, expect, it } from "vitest";
import { followUpAt, followUpPlan } from "../../../src/ai/lite/follow-ups.js";
import type { Move } from "../../../src/ai/lite/types.js";
import { addDays, instantAt, parseCalendarDate, parseTimeOfDay } from "../../../src/kernel/index.js";

const india = "Asia/Kolkata";
const day = parseCalendarDate("2026-11-10");
const minute = 60_000;
/** The instant clocks in the zone show `time` on the day, `days` later. */
const local = (time: string, days = 0, zone = india) => instantAt(addDays(day, days), parseTimeOfDay(time), zone);

/** The first follow-up's time for a customer who wrote at `wrote` and got the reply a minute later. */
function first(lastInboundAt: Date, zone = india) {
  const repliedAt = new Date(lastInboundAt.getTime() + minute);
  return followUpAt({ number: 1, lastInboundAt, repliedAt, previousAt: null, now: repliedAt, timeZone: zone });
}

/** The second's, planned when the first went at `firstAt`. */
const second = (lastInboundAt: Date, firstAt: Date, zone = india) =>
  followUpAt({
    number: 2,
    lastInboundAt,
    repliedAt: new Date(lastInboundAt.getTime() + minute),
    previousAt: firstAt,
    now: firstAt,
    timeZone: zone,
  });

describe("when a follow-up goes", () => {
  // Customer wrote | First | Second, each [time, days after the customer wrote].
  const table: [string, [string, number], [string, number]][] = [
    ["10:00", ["14:01", 0], ["09:00", 1]],
    ["23:50", ["09:00", 1], ["19:50", 1]],
    ["02:00", ["09:00", 0], ["20:59", 0]],
    ["20:30", ["09:00", 1], ["16:30", 1]],
    ["07:30", ["11:31", 0], ["20:59", 0]],
  ];

  it.each(table)("a customer who wrote at %s gets the first at %j and the second at %j", (wrote, one, two) => {
    const lastInboundAt = local(wrote);
    const firstAt = first(lastInboundAt);
    expect(firstAt).toEqual(local(...one));
    if (firstAt === null) return;
    expect(second(lastInboundAt, firstAt)).toEqual(local(...two));
  });

  it("no second when it can't be an hour after the first", () => {
    const lastInboundAt = local("02:00");
    expect(second(lastInboundAt, local("20:30"))).toBeNull();
    // An hour after the first is enough.
    expect(second(lastInboundAt, local("19:59"))).toEqual(local("20:59"));
  });

  it("never sooner than 15 minutes from now", () => {
    // The team gave the chat back late (a reply turn 22h50m after the customer wrote at 10:00): 4 hours on is past the
    // window's end, pulled back to 09:00, which is too soon.
    const lastInboundAt = local("10:00");
    const plan = (repliedAt: Date) =>
      followUpAt({ number: 1, lastInboundAt, repliedAt, previousAt: null, now: repliedAt, timeZone: india });
    expect(plan(local("08:45", 1))).toEqual(local("09:00", 1));
    expect(plan(local("08:50", 1))).toBeNull();
  });

  it("past the window's end inside waking hours goes at the window's end", () => {
    // Wrote 10:30; the reply came back 21 hours later: 4 hours on is past 09:30 the next day, when the window's margin
    // begins.
    const lastInboundAt = local("10:30");
    const repliedAt = local("07:30", 1);
    expect(
      followUpAt({ number: 1, lastInboundAt, repliedAt, previousAt: null, now: repliedAt, timeZone: india }),
    ).toEqual(local("09:30", 1));
  });

  it("keeps the agency's own clock", () => {
    const dubai = "Asia/Dubai";
    const lastInboundAt = local("23:50", 0, dubai);
    const firstAt = first(lastInboundAt, dubai);
    expect(firstAt).toEqual(local("09:00", 1, dubai));
    if (firstAt === null) return;
    expect(second(lastInboundAt, firstAt, dubai)).toEqual(local("19:50", 1, dubai));
  });
});

describe("what a turn leaves for the follow-ups", () => {
  const lastInboundAt = local("10:00");
  const now = local("10:01");
  const greet: Move = { kind: "greet", packageIds: [] };
  const plan = (over: Partial<Parameters<typeof followUpPlan>[0]> = {}) =>
    followUpPlan({
      kind: "reply",
      move: greet,
      stopFollowUps: false,
      sent: true,
      lastInboundAt,
      now,
      timeZone: india,
      ...over,
    });

  it("a reply that sent a message starts the count and plans the first", () => {
    expect(plan()).toEqual({ followUpsSent: 0, followUpAt: local("14:01") });
  });

  it("a reply that handed over, stayed silent, stopped them or sent nothing plans none", () => {
    const none = { followUpsSent: 0, followUpAt: null };
    expect(plan({ move: { kind: "hand_over", reason: "discount" } })).toEqual(none);
    expect(plan({ move: { kind: "silent" }, sent: false })).toEqual(none);
    expect(plan({ move: { kind: "fixed", text: "close" }, stopFollowUps: true })).toEqual(none);
    expect(plan({ sent: false })).toEqual(none);
  });

  it("the first follow-up plans the second; the second plans none", () => {
    const firstAt = local("14:01");
    const nudge = { kind: "nudge" as const, now: firstAt };
    expect(plan({ ...nudge, move: { kind: "follow_up", number: 1, ask: "where" } })).toEqual({
      followUpsSent: 1,
      followUpAt: local("09:00", 1),
    });
    expect(plan({ ...nudge, move: { kind: "follow_up", number: 2, ask: null } })).toEqual({
      followUpsSent: 2,
      followUpAt: null,
    });
  });

  it("a nudge that sent nothing leaves the count as it was", () => {
    expect(plan({ kind: "nudge", move: { kind: "follow_up", number: 1, ask: null }, sent: false })).toEqual({
      followUpAt: null,
    });
  });
});
