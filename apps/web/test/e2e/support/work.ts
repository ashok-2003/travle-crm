// What the work journeys and their camera start from (Today, Home's nudge): the time of day on the test agency's clock
// (India; the day is leads.ts's dayInIndia), a time strictly later today, and follow-ups through the api (R54) that are
// overdue at once. The api refuses a due time before the current minute, so a follow-up due this very minute is the
// one way to be overdue without writing rows. A due field opens on a suggested day and time, which a journey sets with
// fillDue.
import { test, type Locator, type Page } from "@playwright/test";
import { addFollowUpThroughApi, dayInIndia } from "./leads";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The agency's time of day `minutes` from now, as the api takes one: "HH:MM". */
export function timeInIndia(minutes = 0): string {
  return clock.format(new Date(Date.now() + minutes * 60_000));
}

/** The whole minutes left in the agency's day after the current one. */
function minutesLeftToday(): number {
  const [hours = 0, minutes = 0] = timeInIndia().split(":").map(Number);
  return 24 * 60 - (hours * 60 + minutes) - 1;
}

/** How far "later today" stays from now and from midnight, so it is still due today while a journey runs. */
const ROOM = 5;

/**
 * A time strictly later today on the agency's clock, about `minutes` on but at least ROOM minutes from now and from
 * midnight. The day's last minutes have no such time, so there it first waits for the new day, the test's timeout
 * growing by as much.
 */
export async function laterToday(page: Page, minutes: number): Promise<{ on: string; at: string }> {
  if (minutesLeftToday() < 2 * ROOM) {
    const untilMidnight = ((minutesLeftToday() + 1) * 60 - new Date().getSeconds()) * 1_000 + 5_000;
    test.setTimeout(test.info().timeout + untilMidnight);
    await page.waitForTimeout(untilMidnight);
  }
  const ahead = Math.max(ROOM, Math.min(minutes, minutesLeftToday() - ROOM));
  return { on: dayInIndia(), at: timeInIndia(ahead) };
}

/** A follow-up on the lead due this very minute, so overdue as soon as the api has it. */
export async function addOverdueFollowUp(page: Page, leadId: string, title: string): Promise<void> {
  // Close to the minute's end, the api's clock may already be in the next one, which it would refuse as past.
  if (new Date().getSeconds() >= 55) await page.waitForTimeout(6_000);
  await addFollowUpThroughApi(page, leadId, { title, on: dayInIndia(), at: timeInIndia() });
}

/** A day as a person types it in a date field: "2026-10-18" as "18/10/2026". */
export const typedDay = (day: string) => day.split("-").reverse().join("/");

/** Sets the due field in `dialog` (its Day and Time) to `due`, whatever day and time it opened on. */
export async function fillDue(dialog: Locator, due: { on: string; at: string }): Promise<void> {
  await dialog.getByRole("textbox", { name: "Day" }).fill(typedDay(due.on));
  await dialog.getByLabel("Time", { exact: true }).fill(due.at);
}
