// An export's end: after its 7 days, or when an erasure in its organization withdraws it, it is marked expired (no
// more downloads, nothing more stored), then the expiry job deletes its parts and file copies and marks it cleared.
// The row stays, ids and counts only. Marking first, under the row's lock, means the job writing an export can store
// nothing the clearing then misses (export-storage.ts).
import type { PlatformTx } from "@travel-crm/db/platform";
import type { ScheduledJob } from "../jobs/index.js";
import {
  EXPIRE_EXPORTS_QUEUE,
  EXPORT_JOB_SECONDS,
  exportFileKey,
  exportFolder,
  exportPartKey,
  SWEEP_EXPIRED_EXPORTS_QUEUE,
} from "./organization-export.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Why an export ended before its time. */
export type ExportWithdrawalReason = "erasure";

/**
 * How long after a withdrawal the clearing runs: by then the caller's transaction has committed or rolled back (the
 * purge, the longest, allows 10 minutes), and every link handed out before has lapsed (15 minutes).
 */
const CLEAR_AFTER_WITHDRAWAL_MS = 15 * 60 * 1000;

/** Rows and copies handled at a time; copies are deleted a few at once. */
const PAGE = 100;
const DELETES_AT_ONCE = 8;

/** Marks these exports expired and logs each, by id and reason; returns how many it marked. */
async function markExpired(
  tx: PlatformTx,
  where: { targetOrganizationId: string } | { expiresAt: { lte: Date } },
  reason: ExportWithdrawalReason | "time",
  now: Date,
): Promise<number> {
  const marked = await tx.platformExport.updateManyAndReturn({
    where: { ...where, state: { not: "expired" } },
    data: { state: "expired", expiredAt: now },
    select: { id: true, targetOrganizationId: true },
  });
  for (const row of marked) {
    await recordPlatformAudit(
      tx,
      { userId: null },
      {
        action: "organization.export-expired",
        targetType: "organization",
        targetId: row.targetOrganizationId,
        targetOrganizationId: row.targetOrganizationId,
        after: { exportId: row.id, reason },
      },
    );
  }
  return marked.length;
}

/**
 * Withdraws every export of the organization still kept, in the caller's platform transaction: an erasure's, so an
 * erased person doesn't stay in an export for its 7 days. From the commit nothing more is downloaded or stored; the
 * expiry job, queued for 15 minutes later, deletes the parts and copies. Returns how many exports it withdrew.
 */
export async function expireOrganizationExports(
  services: PlatformServices,
  tx: PlatformTx,
  organizationId: string,
  reason: ExportWithdrawalReason,
  now: Date = new Date(),
): Promise<number> {
  const withdrawn = await markExpired(tx, { targetOrganizationId: organizationId }, reason, now);
  if (withdrawn > 0) {
    // On pg-boss's own connection, so queued even if the caller's transaction rolls back: the run then finds nothing.
    await services.queue.send(
      EXPIRE_EXPORTS_QUEUE,
      { organizationId },
      { startAfter: new Date(now.getTime() + CLEAR_AFTER_WITHDRAWAL_MS), expireInSeconds: EXPORT_JOB_SECONDS },
    );
  }
  return withdrawn;
}

/**
 * Deletes an expired export's parts and file copies from storage, those counted and recorded, then everything else
 * under its own folder: what an attempt that died between storing and recording left. Safe to repeat.
 */
async function clearExport(services: PlatformServices, row: { id: string; targetOrganizationId: string }) {
  const { partsWritten } = await services.platformDb.transaction((tx) =>
    tx.platformExport.findUniqueOrThrow({ where: { id: row.id }, select: { partsWritten: true } }),
  );
  for (let part = 1; part <= partsWritten; part += 1) await services.storage.delete(exportPartKey(row, part));
  let after: string | undefined;
  for (;;) {
    const copies = await services.platformDb.transaction((tx) =>
      tx.platformExportFile.findMany({
        where: { exportId: row.id, ...(after === undefined ? {} : { attachmentId: { gt: after } }) },
        orderBy: { attachmentId: "asc" },
        take: PAGE,
      }),
    );
    for (let start = 0; start < copies.length; start += DELETES_AT_ONCE) {
      await Promise.all(
        copies
          .slice(start, start + DELETES_AT_ONCE)
          .map((copy) => services.storage.delete(exportFileKey(row, copy.attachmentId))),
      );
    }
    if (copies.length < PAGE) break;
    after = copies.at(-1)?.attachmentId;
  }
  await services.storage.deletePrefix(exportFolder(row));
}

/**
 * The expiry job: marks every export past its 7 days expired (logged with the reason "time"), then deletes the parts
 * and copies of every expired export not yet cleared, a withdrawn one's included, and marks it cleared. It takes every
 * export due, not just the one whose time came, so a lost job is made up by the next. Returns how many it cleared.
 */
export async function deleteExpiredExports(services: PlatformServices, now: Date = new Date()): Promise<number> {
  await services.platformDb.transaction((tx) => markExpired(tx, { expiresAt: { lte: now } }, "time", now));
  let cleared = 0;
  for (;;) {
    const due = await services.platformDb.transaction((tx) =>
      tx.platformExport.findMany({
        where: { state: "expired", clearedAt: null },
        orderBy: [{ expiredAt: "asc" }, { id: "asc" }],
        select: { id: true, targetOrganizationId: true },
        take: PAGE,
      }),
    );
    for (const row of due) {
      await clearExport(services, row);
      const marked = await services.platformDb.transaction((tx) =>
        tx.platformExport.updateMany({ where: { id: row.id, clearedAt: null }, data: { clearedAt: now } }),
      );
      cleared += marked.count;
    }
    if (due.length < PAGE) return cleared;
  }
}

/**
 * The daily sweep, which the console must schedule: one run of the expiry job over every export due. It is what clears
 * an export whose own job ran out of retries and was then dropped by pg-boss (a week after it failed), so an erased
 * person's data isn't left stored past the export's 7 days. Each run takes every export due, so a lost run is made up
 * by the next, and clearing an export twice deletes nothing more.
 */
export function expiredExportsSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_EXPIRED_EXPORTS_QUEUE,
    // After the demo reset (02:00) and the worker's rate-limit purge (03:30), when no agency is at work.
    cron: "45 3 * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await deleteExpiredExports(services, new Date());
    },
  };
}
