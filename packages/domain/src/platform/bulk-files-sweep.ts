// The console's hourly sweep of the bulk files (B53, B54, D31, M1): imports a week past their last change and exports
// a day past ready, across organizations. It lists a page at a time and sweeps each import or export in its own short
// platform transaction, so a slow one can't time the others out and nothing waits for the next hour behind it; one
// that fails is left for the next run, and the run fails at its end, counting them. Then, for each organization swept,
// the files queued in the deletions' outbox are deleted at once (and left to the outbox's job if storage refuses).
import { ownMessages } from "@travel-crm/integrations/jobs";
import { exportsToSweep, sweepExport } from "../exports/index.js";
import { importsToSweep, sweepImport, type SweepItem } from "../imports/index.js";
import type { OrgTx } from "@travel-crm/db";
import type { ScheduledJob } from "../jobs/index.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_BULK_FILES_QUEUE = "platform.sweep-bulk-files";

const PAGE = 100;

/** Some imports or exports couldn't be swept in a run: the next run tries them again. Counts only, the first error as its cause. */
export class BulkFilesSweepFailedError extends AggregateError {
  static {
    ownMessages(this);
  }

  override readonly name = "BulkFilesSweepFailedError";

  constructor(errors: readonly unknown[], swept: number) {
    super(errors, `${String(errors.length)} imports or exports couldn't be swept and ${String(swept)} were`, {
      cause: errors[0],
    });
  }
}

/** One kind's sweep: what lists the next page, and what sweeps one item. */
interface SweepKind {
  next(tx: OrgTx, now: Date, limit: number, visited: readonly string[]): Promise<SweepItem[]>;
  sweep(tx: OrgTx, item: SweepItem, now: Date): Promise<boolean>;
}

const kinds: readonly SweepKind[] = [
  { next: importsToSweep, sweep: sweepImport },
  { next: exportsToSweep, sweep: sweepExport },
];

/** Sweeps every import and export due, each in its own transaction; returns how many it swept. */
export async function sweepBulkFiles(services: PlatformServices, now: Date): Promise<number> {
  let swept = 0;
  const failed: unknown[] = [];
  const organizationIds = new Set<string>();
  for (const kind of kinds) {
    const visited: string[] = [];
    for (;;) {
      const page = await services.platformDb.transaction((tx) => kind.next(tx, now, PAGE, visited));
      for (const item of page) {
        visited.push(item.id);
        try {
          if (await services.platformDb.transaction((tx) => kind.sweep(tx, item, now))) {
            swept += 1;
            organizationIds.add(item.organizationId);
          }
        } catch (error) {
          failed.push(error);
        }
      }
      if (page.length === 0) break;
    }
  }
  for (const organizationId of organizationIds) await deleteFilesAfterCommit(services, organizationId, now);
  if (failed.length > 0) throw new BulkFilesSweepFailedError(failed, swept);
  return swept;
}

/** Hourly, at 17 minutes past, away from the stored files' own sweep on the hour. */
export function bulkFilesSweepSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_BULK_FILES_QUEUE,
    cron: "17 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await sweepBulkFiles(services, new Date());
    },
  };
}
