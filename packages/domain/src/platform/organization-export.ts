// An organization's export (spec 5: "export, typed confirmation, purge job"), as a platform job: a super admin asks,
// the console's job writes everything the organization keeps to the platform's own storage, its rows and a copy of
// each file, and the console fetches short-lived links to it (export-download.ts). The export is kept 7 days, outside
// the organization's own storage, so it outlives a purge. "organization.exported", which a purge needs, is logged
// only once it is complete.
import type { OrganizationExport } from "@travel-crm/contracts/platform";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { findOrganizationRecord } from "../identity/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The job that writes an export: `{ exportId }`. */
export const EXPORT_ORGANIZATION_QUEUE = "platform.export-organization";

/**
 * The job that deletes the parts and copies of expired exports, queued for when each export expires (`{ exportId }`)
 * and after an erasure withdraws an organization's exports (`{ organizationId }`). Each run takes every export due.
 */
export const EXPIRE_EXPORTS_QUEUE = "platform.expire-exports";

/** How long an export is kept. */
const EXPORT_KEPT_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a download link works. */
export const EXPORT_LINK_SECONDS = 15 * 60;

/**
 * How long one attempt of the export or the expiry job may run before pg-boss counts it failed and retries it; its
 * default is 15 minutes. Rows go quickly, 500 to a short transaction (2 million in a few minutes), but each file is
 * one server-side copy, or one delete: a large agency's 50,000 files at 50 to 100 ms each take 40 to 80 minutes. Two
 * hours covers that with room. The price is that an attempt whose process died is retried only two hours later, which
 * no one is waiting on.
 */
export const EXPORT_JOB_SECONDS = 2 * 60 * 60;

/** An export's row (platform_export), as the platform role reads it. */
export interface ExportRow {
  id: string;
  targetOrganizationId: string;
  requestedBy: string;
  requestedAt: Date;
  state: string;
  partsWritten: number;
  partCount: number | null;
  rowCount: number | null;
  personCount: number | null;
  fileCount: number | null;
  completedAt: Date | null;
  expiresAt: Date;
  expiredAt: Date | null;
  clearedAt: Date | null;
}

type ExportPlace = Pick<ExportRow, "id" | "targetOrganizationId">;

/** The export's own folder: the platform's prefix, never the organization's, which a purge sweeps. Ids only. */
export function exportFolder(row: ExportPlace): string {
  return `platform/exports/${row.targetOrganizationId}/${row.id}/`;
}

/** Where an export's part is stored, numbered from 1. */
export function exportPartKey(row: ExportPlace, part: number): string {
  return `${exportFolder(row)}${String(part).padStart(5, "0")}.jsonl`;
}

/** Where an export keeps its copy of one of the organization's files, by the file's (attachment's) id. */
export function exportFileKey(row: ExportPlace, attachmentId: string): string {
  return `${exportFolder(row)}files/${attachmentId}`;
}

function exportOf(row: ExportRow): OrganizationExport {
  return {
    exportId: row.id,
    organizationId: row.targetOrganizationId,
    state: row.state as OrganizationExport["state"],
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    parts: row.partCount,
    rows: row.rowCount,
    people: row.personCount,
    files: row.fileCount,
  };
}

/** Marks an export failed unless it finished or expired; its parts and copies stay until it expires. */
export async function markExportFailed(services: PlatformServices, exportId: string): Promise<void> {
  await services.platformDb.transaction((tx) =>
    tx.platformExport.updateMany({ where: { id: exportId, state: "requested" }, data: { state: "failed" } }),
  );
}

/**
 * For a catch block that rethrows `error`: marks the export failed first. If that fails too, both errors go up
 * together, in words of ours, so the failed-jobs list says the export may still read as requested.
 */
export async function markExportFailedAfter(services: PlatformServices, exportId: string, error: unknown) {
  try {
    await markExportFailed(services, exportId);
  } catch (marking) {
    throw ownMessage(
      new AggregateError([error, marking], `Export ${exportId} failed, and could not be marked failed`, {
        cause: error,
      }),
    );
  }
}

/**
 * Asks for an export, and queues the job that writes it. The job is queued after the row commits, so it always finds
 * it; if queueing fails, the export is marked failed and the super admin asks again.
 */
export async function requestOrganizationExport(
  services: PlatformServices,
  staff: { userId: string },
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationExport> {
  const row = await services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, organizationId);
    const created = await tx.platformExport.create({
      data: {
        targetOrganizationId: organizationId,
        requestedBy: staff.userId,
        requestedAt: now,
        expiresAt: new Date(now.getTime() + EXPORT_KEPT_MS),
      },
    });
    await recordPlatformAudit(tx, staff, {
      action: "organization.export-requested",
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      after: { exportId: created.id },
    });
    return created;
  });
  try {
    await services.queue.send(
      EXPORT_ORGANIZATION_QUEUE,
      { exportId: row.id },
      { id: row.id, expireInSeconds: EXPORT_JOB_SECONDS },
    );
  } catch (error) {
    await markExportFailedAfter(services, row.id, error);
    throw error;
  }
  return exportOf(row);
}

/** The organization's exports, newest first; they outlive the organization's purge. */
export async function listOrganizationExports(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationExport[]> {
  const rows = await services.platformDb.transaction((tx) =>
    tx.platformExport.findMany({
      where: { targetOrganizationId: organizationId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
  );
  return rows.map(exportOf);
}
