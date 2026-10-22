// The console's hourly sweep of the website form's ledger (spec 7.2): a submission's row is kept 90 days, long enough to
// count a month and to tell a double send from a new enquiry, then deleted. Only the platform role may delete them. A
// page at a time in transactions of their own so one slow page can't time the rest out; safe to run twice, since a row
// already gone is not there to delete.
import { sql, type Sql } from "@travel-crm/db";
import type { ScheduledJob } from "../jobs/index.js";
import type { PlatformServices } from "./services.js";

export const WEBSITE_FORMS_SWEEP_QUEUE = "platform.sweep-website-forms";

/** How long a ledger row is kept. */
const KEPT_MS = 90 * 24 * 60 * 60 * 1000;
const PAGE = 200;
/** Enough runs to clear a backlog, few enough that a bug cannot make the job loop. */
const MOST_PAGES = 50;

/** The SQL of one page's read: the oldest rows past the cutoff, across every organization, from the sweep index. */
export const dueLedgerRowsQuery = (cutoff: Date, limit: number): Sql => sql`
  SELECT id FROM website_form_submission WHERE created_at < ${cutoff} ORDER BY created_at ASC LIMIT ${limit}`;

/** Deletes ledger rows older than 90 days, a page at a time until a page comes back short. */
export async function sweepWebsiteFormsNow(
  services: PlatformServices,
  now: Date,
): Promise<{ ledgerRowsDeleted: number }> {
  const cutoff = new Date(now.getTime() - KEPT_MS);
  let ledgerRowsDeleted = 0;
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const deleted = await services.platformDb.transaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string }[]>(dueLedgerRowsQuery(cutoff, PAGE));
      const { count } = await tx.websiteFormSubmission.deleteMany({ where: { id: { in: due.map((row) => row.id) } } });
      return count;
    });
    ledgerRowsDeleted += deleted;
    if (deleted < PAGE) break;
  }
  return { ledgerRowsDeleted };
}

/** Hourly, at 47 minutes past, away from the other sweeps. It may sleep: nothing here is time-critical. */
export function websiteFormsSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: WEBSITE_FORMS_SWEEP_QUEUE,
    cron: "47 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepWebsiteFormsNow(services, new Date());
    },
  };
}
