// The console's hourly sweep of the Sheets sync (S5, S6, S31): drafts untouched for a day, problems resolved for a week,
// schedule rows and claims nothing live holds. Platform work across organizations, a page at a time in transactions of its
// own so one slow page can't time the rest out.
import type { ScheduledJob } from "../jobs/index.js";
import { sweepSheets } from "../sheets/index.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_SHEETS_QUEUE = "platform.sweep-sheets";

const PAGE = 200;
/** Enough runs to clear a backlog, few enough that a bug cannot make the job loop. */
const MOST_PAGES = 50;

/** Sweeps until a page of drafts and a page of problems both come back short; returns what it swept in all. */
export async function sweepSheetsNow(services: PlatformServices, now: Date) {
  const total = { draftsDeleted: 0, problemsDropped: 0, scheduleRowsDropped: 0, claimsDropped: 0 };
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const swept = await services.platformDb.transaction((tx) => sweepSheets(tx, now, PAGE));
    total.draftsDeleted += swept.draftsDeleted;
    total.problemsDropped += swept.problemsDropped;
    total.scheduleRowsDropped += swept.scheduleRowsDropped;
    total.claimsDropped += swept.claimsDropped;
    if (swept.draftsDeleted < PAGE && swept.problemsDropped < PAGE) break;
  }
  return total;
}

/** Hourly, at 41 minutes past, away from the other sweeps. It may sleep: nothing here is time-critical. */
export function sheetsSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_SHEETS_QUEUE,
    cron: "41 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepSheetsNow(services, new Date());
    },
  };
}
