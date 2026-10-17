// What the work journeys and their camera start from (Today, Home's nudge): the time of day on the test agency's clock
// (India, agency-clock.ts; the day is leads.ts's dayInIndia), a time strictly later today, and follow-ups through the
// api (R54) that are overdue at once. The api refuses a due time before the current minute, so a follow-up due this
// very minute is the one way to be overdue without writing rows. A due field opens on a suggested day and time, which
// a journey sets with fillDue.
import { test, type Locator, type Page } from "@playwright/test";
import { laterTodayAt, timeInIndiaAt } from "./agency-clock";
import { addFollowUpThroughApi, dayInIndia } from "./leads";

/** The agency's time of day `minutes` from now, as the api takes one: "HH:MM". */
export function timeInIndia(minutes = 0): string {
  return timeInIndiaAt(new Date(Date.now() + minutes * 60_000));
}

/**
 * A time strictly later today on the agency's clock, about `minutes` on (agency-clock.ts). The day's last minutes
 * have no such time, so there it first waits for the new day, a few minutes at most, the test's timeout growing by as
 * much.
 */
export async function laterToday(page: Page, minutes: number): Promise<{ on: string; at: string }> {
  const first = laterTodayAt(new Date(), minutes);
  if ("due" in first) return first.due;
  test.setTimeout(test.info().timeout + first.waitMs);
  await page.waitForTimeout(first.waitMs);
  const next = laterTodayAt(new Date(), minutes);
  if ("due" in next) return next.due;
  throw new Error("The agency's new day has no time later today either");
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
