// Working time (release 4, spec 4.5): the agency's one schedule, as days plus an opening and a closing minute in its
// time zone, and the instant a wait of working minutes ends. Only the slow-reply clock counts this way.
import { addDays, calendarDateIn, instantAt, parseTimeOfDay, startOfDayIn, type CalendarDate } from "./time.js";
import { isValidTimeZone } from "@travel-crm/contracts/kernel";

export interface WorkingHours {
  /** The days the agency answers, as bits: 1 Monday to 64 Sunday. */
  workdays: number;
  /** Minutes into the day it opens and closes (0-1440), opens before closes. */
  opensMinute: number;
  closesMinute: number;
}

const MINUTE_MS = 60 * 1000;
/** A wait is at most a day of minutes and a day has a minute, so this many days always reach the end. */
const MOST_DAYS_SEARCHED = 1440 * 7 + 7;

function clockAt(day: CalendarDate, minute: number, timeZone: string): Date {
  if (minute >= 1440) return startOfDayIn(addDays(day, 1), timeZone);
  const text = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return instantAt(day, parseTimeOfDay(text), timeZone);
}

/** Whether the schedule works on the day: its bit, 1 for Monday. */
function worksOn(day: CalendarDate, workdays: number): boolean {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const mondayFirst = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  return (workdays & (1 << mondayFirst)) !== 0;
}

/**
 * The instant that is `minutes` of working time after `start`: time before opening or after closing, and days off,
 * don't count. With no working day at all, the minutes are wall minutes.
 */
export function addWorkingMinutes(start: Date, minutes: number, hours: WorkingHours, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Not an IANA time zone name: ${JSON.stringify(timeZone)}`);
  if (!Number.isSafeInteger(minutes) || minutes < 0)
    throw new RangeError("Minutes must be a whole number, not negative");
  if (hours.workdays === 0 || minutes === 0) return new Date(start.getTime() + minutes * MINUTE_MS);
  let remaining = minutes * MINUTE_MS;
  const firstDay = calendarDateIn(start, timeZone);
  for (let offset = 0; offset < MOST_DAYS_SEARCHED; offset += 1) {
    const day = addDays(firstDay, offset);
    if (!worksOn(day, hours.workdays)) continue;
    const opens = clockAt(day, hours.opensMinute, timeZone).getTime();
    const closes = clockAt(day, hours.closesMinute, timeZone).getTime();
    const from = Math.max(start.getTime(), opens);
    if (from >= closes) continue;
    if (closes - from >= remaining) return new Date(from + remaining);
    remaining -= closes - from;
  }
  throw new RangeError("The working hours leave no time to count");
}
