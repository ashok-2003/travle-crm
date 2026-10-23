// The console's hourly sweep of the Meta lead ads (spec 5): a Page chosen at Facebook and never confirmed is let go after a
// day, its sealed token deleted. Platform work across organizations, a page at a time in transactions of its own.
import type { ScheduledJob } from "../jobs/index.js";
import { sweepMeta } from "../meta-leads/index.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_META_QUEUE = "platform.sweep-meta";

const PAGE = 200;
/** Enough runs to clear a backlog, few enough that a bug cannot make the job loop. */
const MOST_PAGES = 50;

/** Sweeps until a page of drafts comes back short; returns how many drafts were let go in all. */
export async function sweepMetaNow(services: PlatformServices, now: Date): Promise<{ draftsLetGo: number }> {
  let draftsLetGo = 0;
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const swept = await services.platformDb.transaction((tx) => sweepMeta(tx, now, PAGE));
    draftsLetGo += swept.draftsLetGo;
    if (swept.draftsLetGo < PAGE) break;
  }
  return { draftsLetGo };
}

/** Hourly, at 53 minutes past, away from the other sweeps. It may sleep: nothing here is time-critical. */
export function metaSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_META_QUEUE,
    cron: "53 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepMetaNow(services, new Date());
    },
  };
}
