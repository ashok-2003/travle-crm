// The export job, which only the console process runs: it reads the organization a page at a time (no long
// transaction) and stores JSON lines a part at a time (no export held in memory), then marks the export done and logs
// "organization.exported". With it, the expiry job (organization-export-expiry.ts).
import type { JobData } from "@travel-crm/integrations/jobs";
import type { JobHandler } from "../jobs/index.js";
import { exportPage, tablesToExport, type ExportedRow } from "./export-rows.js";
import { expireOrganizationExports } from "./organization-export-expiry.js";
import {
  EXPIRE_EXPORTS_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
  exportPartKey,
  markExportFailed,
  type ExportRow,
} from "./organization-export.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export interface ExportSizes {
  /** Rows read in one transaction. */
  batchRows: number;
  /** A part is stored once it holds this many bytes; the last one may be smaller. */
  partBytes: number;
}

const DEFAULT_SIZES: ExportSizes = { batchRows: 500, partBytes: 8 * 1024 * 1024 };

/** The expiry job runs this long after an export expires, so the clocks of the database and the console agree. */
const EXPIRY_MARGIN_MS = 60 * 60 * 1000;

/** Collects JSON lines and stores them a part at a time, numbered from 1. */
class PartWriter {
  private lines: string[] = [];
  private bytes = 0;
  parts = 0;

  constructor(
    private readonly sizes: ExportSizes,
    private readonly store: (part: number, body: Uint8Array) => Promise<void>,
  ) {}

  async add(line: object): Promise<void> {
    const text = `${JSON.stringify(line)}\n`;
    this.lines.push(text);
    this.bytes += Buffer.byteLength(text);
    if (this.bytes >= this.sizes.partBytes) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.lines.length === 0) return;
    this.parts += 1;
    await this.store(this.parts, new TextEncoder().encode(this.lines.join("")));
    this.lines = [];
    this.bytes = 0;
  }
}

/** The export to write, or null when there is none to write: gone, done or expired (a repeated job does nothing). */
async function exportToWrite(services: PlatformServices, exportId: string): Promise<ExportRow | null> {
  const row = await services.platformDb.transaction((tx) => tx.platformExport.findUnique({ where: { id: exportId } }));
  return row && (row.state === "requested" || row.state === "failed") ? row : null;
}

async function organizationExists(services: PlatformServices, organizationId: string): Promise<boolean> {
  const found = await services.platformDb.transaction((tx) => tx.organization.count({ where: { id: organizationId } }));
  return found > 0;
}

/**
 * The export job. Batches see the organization as it is when each runs: not one snapshot, which an export before a
 * purge doesn't need, as a cancelled organization changes nothing. An attempt that fails marks the export failed and
 * leaves its parts for the expiry; pg-boss's retry writes them all again. An organization purged meanwhile fails it.
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
    { id: row.id, startAfter: new Date(row.expiresAt.getTime() + EXPIRY_MARGIN_MS) },
  );
  const organizationId = row.targetOrganizationId;
  try {
    if (!(await organizationExists(services, organizationId))) {
      await markExportFailed(services, row.id);
      return;
    }
    const writer = new PartWriter(sizes, async (part, body) => {
      await services.storage.put({ key: exportPartKey(row, part), contentType: "application/x-ndjson", body });
      await services.platformDb.transaction((tx) =>
        tx.platformExport.updateMany({
          where: { id: row.id, partsWritten: { lt: part } },
          data: { partsWritten: part },
        }),
      );
    });
    let rowCount = 0;
    let personCount = 0;
    for (const table of await tablesToExport(services)) {
      let after: ExportedRow | null = null;
      for (;;) {
        const page = await exportPage(services, organizationId, { table, after, limit: sizes.batchRows });
        for (const found of page.rows) await writer.add({ table, row: found });
        for (const person of page.people) await writer.add({ person });
        rowCount += page.rows.length;
        personCount += page.people.length;
        if (page.rows.length < sizes.batchRows) break;
        after = page.rows.at(-1) ?? null;
      }
    }
    await writer.flush();
    await finishExport(services, row, { parts: writer.parts, rows: rowCount, people: personCount });
  } catch (error) {
    await markExportFailed(services, row.id).catch(() => undefined);
    throw error;
  }
}

/**
 * Marks the export done and logs "organization.exported", once: a twin attempt that finished first wins. An
 * organization purged while it was read leaves an export with only part of it, which is marked failed instead.
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
    const done = await tx.platformExport.updateMany({
      where: { id: row.id, state: { in: ["requested", "failed"] } },
      data: {
        state: "done",
        partCount: counts.parts,
        rowCount: counts.rows,
        personCount: counts.people,
        completedAt: new Date(),
      },
    });
    if (done.count === 0) return;
    await recordPlatformAudit(
      tx,
      { userId: row.requestedBy },
      {
        action: "organization.exported",
        targetType: "organization",
        targetId: row.targetOrganizationId,
        targetOrganizationId: row.targetOrganizationId,
        after: { exportId: row.id, ...counts },
      },
    );
  });
}

/** Reads an export job's data back, refusing anything malformed: a bug, so the job fails loudly. */
function exportJobOf(data: JobData): { exportId: string } {
  const { exportId } = data;
  if (typeof exportId !== "string") throw new TypeError("An export job needs an exportId");
  return { exportId };
}

/** The export's two jobs, for the console process's job runner. */
export function organizationExportJobHandlers(services: PlatformServices): JobHandler[] {
  return [
    { queue: EXPORT_ORGANIZATION_QUEUE, handle: (data) => runOrganizationExport(services, exportJobOf(data)) },
    {
      queue: EXPIRE_EXPORTS_QUEUE,
      handle: async () => {
        await expireOrganizationExports(services);
      },
    },
  ];
}
