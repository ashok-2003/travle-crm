// The console's hourly sweep of the bulk files (B53, B54, D31): imports a week past their last change and exports a
// day past ready, across organizations, a batch at a time in platform transactions; then, for each organization swept,
// the files queued in the deletions' outbox are deleted at once (and left to the outbox's job if storage refuses).
import { sweepExpiredExports } from "../exports/index.js";
import { sweepExpiredImports } from "../imports/index.js";
import type { ScheduledJob } from "../jobs/index.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import type { PlatformServices } from "./services.js";

export const SWEEP_BULK_FILES_QUEUE = "platform.sweep-bulk-files";

const BATCH = 100;

/** Sweeps until a batch finds fewer than it may take of either kind; returns how many imports and exports it swept. */
export async function sweepBulkFiles(services: PlatformServices, now: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await services.platformDb.transaction(async (tx) => {
      const imports = await sweepExpiredImports(tx, now, BATCH);
      const exports = await sweepExpiredExports(tx, now, BATCH);
      return {
        swept: imports.swept + exports.swept,
        more: imports.swept >= BATCH || exports.swept >= BATCH,
        organizationIds: [...new Set([...imports.organizationIds, ...exports.organizationIds])],
      };
    });
    for (const organizationId of batch.organizationIds) await deleteFilesAfterCommit(services, organizationId, now);
    total += batch.swept;
    if (!batch.more) return total;
  }
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
