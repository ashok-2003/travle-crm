"use client";

// Today as the agency's clock says it (the organization's time zone), never the browser's: the api decides which days
// are ahead by that day, so a screen that offers a change must too.
import { useMe } from "@/session/me-context";
import type { Day } from "./departure-calendar-days";

/** Today in a time zone, yyyy-mm-dd. */
export function dayIn(timeZone: string, now: Date = new Date()): Day {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function useAgencyToday(): Day {
  return dayIn(useMe().organization.timeZone);
}
