// The test agency's clock (India) for the work journeys and their camera, from a given moment, so a unit test can set
// it (later-today.test.ts): the time of day, and a time strictly later today, or how long to wait for the new day
// when the day has no such time left.
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * How far "later today" stays from now and from midnight, so it is still due today while a journey runs (a journey
 * takes well under a minute). Small, so the day's last minutes, which have no such time, are few to wait through.
 */
export const ROOM = 2;

/** The agency's time of day at `moment`, as the api takes one: "HH:MM". */
export function timeInIndiaAt(moment: Date): string {
  return clock.format(moment);
}

/** The whole minutes left in the agency's day after the current one. */
function minutesLeftToday(now: Date): number {
  const [hours = 0, minutes = 0] = timeInIndiaAt(now).split(":").map(Number);
  return 24 * 60 - (hours * 60 + minutes) - 1;
}

/**
 * A time strictly later today on the agency's clock, about `minutes` on but at least ROOM minutes from now and from
 * midnight; or, in the day's last minutes, which have no such time, how long to wait until just past midnight.
 */
export function laterTodayAt(now: Date, minutes: number): { due: { on: string; at: string } } | { waitMs: number } {
  const left = minutesLeftToday(now);
  if (left < 2 * ROOM) return { waitMs: ((left + 1) * 60 - now.getSeconds()) * 1_000 + 5_000 };
  const ahead = Math.max(ROOM, Math.min(minutes, left - ROOM));
  return { due: { on: calendar.format(now), at: timeInIndiaAt(new Date(now.getTime() + ahead * 60_000)) } };
}
