// The export job, which only the console process runs: it reads the organization a page at a time (no long
// transaction), stores JSON lines a part at a time (no export held in memory) and a copy of each file, then marks the
// export done and logs "organization.exported". With it, the expiry job (organization-export-expiry.ts).
import { ownMessage, type JobData } from "@travel-crm/integrations/jobs";
import type { JobHandler } from "../jobs/index.js";
import { exportPage, tablesToExport, type ExportedRow } from "./export-rows.js";
import { copyFiles, ExportStopped, PartWriter, type ExportSizes } from "./export-storage.js";
import { deleteExpiredExports } from "./organization-export-expiry.js";
import {
  EXPIRE_EXPORTS_QUEUE,
  EXPORT_JOB_SECONDS,
  EXPORT_ORGANIZATION_QUEUE,
  markExportFailed,
  markExportFailedAfter,
  type ExportRow,
} from "./organization-export.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

const DEFAULT_SIZES: ExportSizes = { batchRows: 500, partBytes: 8 * 1024 * 1024 };

/** The expiry job runs this long after an export expires, so the clocks of the database and the console agree. */
const EXPIRY_MARGIN_MS = 60 * 60 * 1000;

/** The export to write, or null when there is none to write: gone, done or expired (a repeated job does nothing). */
async function exportToWrite(services: PlatformServices, exportId: string): Promise<ExportRow | null> {
  const row = await services.platformDb.transaction((tx) => tx.platformExport.findUnique({ where: { id: exportId } }));
  return row && (row.state === "requested" || row.state === "failed") ? row : null;
}

async function organizationExists(services: PlatformServices, organizationId: string): Promise<boolean> {
  const found = await services.platformDb.transaction((tx) => tx.organization.count({ where: { id: organizationId } }));
  return found > 0;
}

/** Every table's rows, its people with the member table, as lines. Returns how many rows and people. */
async function writeRows(
  services: PlatformServices,
  organizationId: string,
  writer: PartWriter,
  sizes: ExportSizes,
): Promise<{ rows: number; people: number }> {
  let rows = 0;
  let people = 0;
  for (const table of await tablesToExport(services)) {
    let after: ExportedRow | null = null;
    for (;;) {
      const page = await exportPage(services, organizationId, { table, after, limit: sizes.batchRows });
      for (const found of page.rows) await writer.add({ table, row: found });
      for (const person of page.people) await writer.add({ person });
      rows += page.rows.length;
      people += page.people.length;
      if (page.rows.length < sizes.batchRows) break;
      after = page.rows.at(-1) ?? null;
    }
  }
  await writer.flush();
  return { rows, people };
}

/**
 * The export job. Batches see the organization as it is when each runs: not one snapshot, which an export before a
 * purge doesn't need, as a cancelled organization changes nothing. An attempt that fails marks the export failed and
 * leaves what it stored for the expiry; pg-boss's retry writes it all again. An organization purged meanwhile fails
 * it; an export withdrawn meanwhile (an erasure) stops it.
 */
export async function runOrganizationExport(
  services: PlatformServices,
  job: { exportId: string },
  sizes: ExportSizes = DEFAULT_SIZES,
): Promise<void> {
  const row = await exportToWrite(services, job.exportId);
  if (!row) return;
  // Queued first, so a failing export's parts are deleted too. The same id each attempt: queued once.
  await services.queue.send(
    EXPIRE_EXPORTS_QUEUE,
    { exportId: row.id },
    {
      id: row.id,
      startAfter: new Date(row.expiresAt.getTime() + EXPIRY_MARGIN_MS),
      expireInSeconds: EXPORT_JOB_SECONDS,
    },
  );
  try {
    if (!(await organizationExists(services, row.targetOrganizationId))) {
      await markExportFailed(services, row.id);
      return;
    }
    const writer = new PartWriter(services, row, sizes);
    const counts = await writeRows(services, row.targetOrganizationId, writer, sizes);
    await copyFiles(services, row);
    await finishExport(services, row, { parts: writer.parts, ...counts });
  } catch (error) {
    if (error instanceof ExportStopped) return;
    await markExportFailedAfter(services, row.id, error);
    throw error;
  }
}

/**
 * Marks the export done and logs "organization.exported", once: a twin attempt that finished first wins, and an
 * export withdrawn meanwhile stays withdrawn. An organization purged while it was read leaves an export with only part
 * of it, which is marked failed instead.
 */
async function finishExport(
  services: PlatformServices,
  row: ExportRow,
  counts: { parts: number; rows: number; people: number },
): Promise<void> {
  await services.platformDb.transaction(async (tx) => {
    if ((await tx.organization.count({ where: { id: row.targetOrganizationId } })) === 0) {
      await tx.platformExport.updateMany({ where: { id: row.id, state: "requested" }, data: { state: "failed" } });
      return;
    }
    // Every copy recorded, an earlier attempt's included: each is stored, and the download links to them all.
    const done = { ...counts, files: await tx.platformExportFile.count({ where: { exportId: row.id } }) };
    const marked = await tx.platformExport.updateMany({
      where: { id: row.id, state: { in: ["requested", "failed"] } },
      data: {
        state: "done",
        partCount: done.parts,
        rowCount: done.rows,
        personCount: done.people,
        fileCount: done.files,
        completedAt: new Date(),
      },
    });
    if (marked.count === 0) return;
    await recordPlatformAudit(
      tx,
      { userId: row.requestedBy },
      {
        action: "organization.exported",
        targetType: "organization",
        targetId: row.targetOrganizationId,
        targetOrganizationId: row.targetOrganizationId,
        after: { exportId: row.id, ...done },
      },
    );
  });
}

/** Reads an export job's data back, refusing anything malformed: a bug, so the job fails loudly. */
function exportJobOf(data: JobData): { exportId: string } {
  const { exportId } = data;
  // Our own fixed words, so the failed-jobs list keeps them.
  if (typeof exportId !== "string") throw ownMessage(new TypeError("An export job needs an exportId"));
  return { exportId };
}

/** The export's two jobs, for the console process's job runner. */
export function organizationExportJobHandlers(services: PlatformServices): JobHandler[] {
  return [
    {
      queue: EXPORT_ORGANIZATION_QUEUE,
      handle: async (data) => {
        await runOrganizationExport(services, exportJobOf(data));
      },
    },
    {
      queue: EXPIRE_EXPORTS_QUEUE,
      handle: async () => {
        await deleteExpiredExports(services);
      },
    },
  ];
}
