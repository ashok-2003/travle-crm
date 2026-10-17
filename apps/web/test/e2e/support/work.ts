// What the work journeys and their camera start from (Today, Home's nudge): times on the test agency's clock (India)
// as the api takes a due time, and follow-ups through the api (R54) that are overdue at once or due later today. The
// api refuses a due time before the current minute, so a follow-up due this very minute is the one way to be overdue
// without writing rows.
import type { Page } from "@playwright/test";
import { addFollowUpThroughApi } from "./leads";

const india = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The agency's day and time `minutes` from now: { on: "yyyy-mm-dd", at: "HH:MM" }. */
export function inIndia(minutes = 0): { on: string; at: string } {
  const parts = india.formatToParts(new Date(Date.now() + minutes * 60_000));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((each) => each.type === type)?.value ?? "";
  return { on: `${part("year")}-${part("month")}-${part("day")}`, at: `${part("hour")}:${part("minute")}` };
}

/** A time later today, about `minutes` on, but never past the agency's midnight. */
export function laterToday(minutes: number): { on: string; at: string } {
  const now = inIndia();
  const later = inIndia(minutes);
  return later.on === now.on ? later : { on: now.on, at: "23:59" };
}

/** A follow-up on the lead due this very minute, so overdue as soon as the api has it. */
export async function addOverdueFollowUp(page: Page, leadId: string, title: string): Promise<void> {
  // Close to the minute's end, the api's clock may already be in the next one, which it would refuse as past.
  if (new Date().getSeconds() >= 55) await page.waitForTimeout(6_000);
  await addFollowUpThroughApi(page, leadId, { title, ...inIndia() });
}
