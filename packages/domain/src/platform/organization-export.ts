// An organization's export (spec 5: "export, typed confirmation, purge job"), as a platform job: a super admin asks,
// the console's job writes everything the organization keeps to the platform's own storage, and the console fetches
// short-lived links to it, each fetch in the platform log. The export is kept 7 days, outside the organization's own
// storage, so it outlives a purge. "organization.exported", which a purge needs, is logged only once it is complete.
import type { OrganizationExport, OrganizationExportDownload } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { exportedFiles } from "../files/index.js";
import { findOrganizationRecord } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The job that writes an export: `{ exportId }`. */
export const EXPORT_ORGANIZATION_QUEUE = "platform.export-organization";

/** The job that deletes expired exports' parts, queued for when each export expires: `{ exportId }`. */
export const EXPIRE_EXPORTS_QUEUE = "platform.expire-exports";

/** How long an export is kept. */
const EXPORT_KEPT_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a download link works. */
const EXPORT_LINK_SECONDS = 15 * 60;

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
  completedAt: Date | null;
  expiresAt: Date;
}

/** Where an export's part is stored: the platform's prefix, never the organization's, which a purge sweeps. Ids only. */
export function exportPartKey(row: Pick<ExportRow, "id" | "targetOrganizationId">, part: number): string {
  return `platform/exports/${row.targetOrganizationId}/${row.id}/${String(part).padStart(5, "0")}.jsonl`;
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
  };
}

/** Marks an export failed unless it finished; its parts stay until it expires. */
export async function markExportFailed(services: PlatformServices, exportId: string): Promise<void> {
  await services.platformDb.transaction((tx) =>
    tx.platformExport.updateMany({ where: { id: exportId, state: "requested" }, data: { state: "failed" } }),
  );
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
    await services.queue.send(EXPORT_ORGANIZATION_QUEUE, { exportId: row.id }, { id: row.id });
  } catch (error) {
    await markExportFailed(services, row.id).catch(() => undefined);
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

/**
 * Links to a done export's parts, and to the organization's stored files, which the export lists but doesn't copy.
 * Each works for 15 minutes; each fetch is recorded in the platform log, ids and counts only.
 */
export async function downloadOrganizationExport(
  services: PlatformServices,
  staff: PlatformActor,
  exportId: string,
  now: Date = new Date(),
): Promise<OrganizationExportDownload> {
  return services.platformDb.transaction(async (tx) => {
    const row = await tx.platformExport.findUnique({ where: { id: exportId } });
    if (!row) throw new DomainError("NOT_FOUND", "EXPORT_NOT_FOUND", "There is no such export");
    if (row.state === "expired" || row.expiresAt <= now) {
      throw new DomainError("CONFLICT", "EXPORT_EXPIRED", "This export has expired: ask for a new one");
    }
    if (row.state !== "done" || row.partCount === null) {
      throw new DomainError("CONFLICT", "EXPORT_NOT_READY", "This export isn't finished");
    }
    const parts = [];
    for (let part = 1; part <= row.partCount; part += 1) {
      const fileName = `export-${row.id}-${String(part)}.jsonl`;
      parts.push({
        part,
        url: await services.storage.presignDownload({ key: exportPartKey(row, part), fileName }, EXPORT_LINK_SECONDS),
      });
    }
    const organizationId = row.targetOrganizationId;
    const files = (
      await asOrganization(tx, organizationId, (orgTx) =>
        exportedFiles(orgTx, services.storage, { organizationId }, EXPORT_LINK_SECONDS),
      )
    ).flatMap((file) =>
      file.downloadUrl ? [{ fileId: file.id, fileName: file.fileName, url: file.downloadUrl }] : [],
    );
    await recordPlatformAudit(tx, staff, {
      action: "organization.export-downloaded",
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      after: { exportId: row.id, parts: parts.length, files: files.length },
    });
    return {
      exportId: row.id,
      linksExpireAt: new Date(now.getTime() + EXPORT_LINK_SECONDS * 1000).toISOString(),
      parts,
      files,
    };
  });
}
