// Where the natural agent's follow-up goes (G7): the model says when in words of the day, code places the time on the
// agency's clock, moves it into waking hours (9 am to 9 pm) and keeps it inside WhatsApp's window less its margin; a
// time past the window is refused (ruling 13), with a call-back task as the way on.
import type { FollowUpWhen } from "@travel-crm/contracts/ai";
import {
  addDays,
  calendarDateIn,
  formatShortDay,
  instantAt,
  parseTimeOfDay,
  type CalendarDate,
  type TimeOfDay,
} from "../../../kernel/index.js";
import { followUpWindowEndOf, intoWakingHours } from "../../lite/follow-ups.js";
import { stampOf } from "../context/chat-turns.js";
import type { Refused } from "./quote.js";

const MINUTE_MS = 60_000;
const FEW_HOURS_MS = 3 * 3_600_000;
const morning = parseTimeOfDay("10:00");
const evening = parseTimeOfDay("18:00");

const refused = (why: string): Refused => ({ refused: `refused: ${why}` });

export interface FollowUpInput {
  when: FollowUpWhen;
  /** The day, for `on_date` only. */
  date: CalendarDate | null;
  now: Date;
  lastInboundAt: Date;
  timeZone: string;
  conversationId: string;
}

/** The time asked, read on the agency's day: at 11:43 pm it is still that day, and its evening has gone. */
function askedTime(when: Exclude<FollowUpWhen, "none">, input: FollowUpInput, today: CalendarDate): Date | Refused {
  const at = (day: CalendarDate, time: TimeOfDay) => instantAt(day, time, input.timeZone);
  switch (when) {
    case "in_a_few_hours":
      return new Date(input.now.getTime() + FEW_HOURS_MS);
    case "this_evening": {
      const tonight = at(today, evening);
      return tonight > input.now ? tonight : refused("it's past 6 pm already; use tomorrow_morning");
    }
    case "tomorrow_morning":
      return at(addDays(today, 1), morning);
    case "tomorrow_evening":
      return at(addDays(today, 1), evening);
    case "on_date":
      return input.date !== null && input.date > today
        ? at(input.date, morning)
        : refused(`on_date needs a day after today (${formatShortDay(today, today)}); for sooner, use in_a_few_hours`);
  }
}

/** When the follow-up goes, in whole minutes; null for "none"; or why not, with the way on. */
export function placeFollowUp(input: FollowUpInput): Date | null | Refused {
  const { when, timeZone } = input;
  if (when === "none") return null;
  const today = calendarDateIn(input.now, timeZone);
  const asked = askedTime(when, input, today);
  if ("refused" in asked) return asked;
  const awake = intoWakingHours(asked, timeZone);
  const at = new Date(Math.floor(awake.getTime() / MINUTE_MS) * MINUTE_MS);
  const windowEnd = followUpWindowEndOf(input.lastInboundAt);
  if (at <= windowEnd) return at;
  return refused(
    `past the WhatsApp window (it ends ${stampOf(windowEnd, { today, timeZone })}); for a later check-back, ` +
      "create_task(kind: call_back, call_at: …)",
  );
}
