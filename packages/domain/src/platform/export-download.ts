// Downloading a done export from the console: short-lived links to its parts and to its copies of the organization's
// files, each fetch in the platform log by ids and counts. The copies are the export's own, so they work after a purge.
import type { OrganizationExportDownload } from "@travel-crm/contracts/platform";
import { DomainError } from "../kernel/index.js";
import { EXPORT_LINK_SECONDS, exportFileKey, exportPartKey } from "./organization-export.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * Links to a done export's parts and file copies, each working for 15 minutes. A file's link saves it under its id;
 * the attachment rows in the parts give each id its name. Refused for an export not done, expired or withdrawn.
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
    const link = (key: string, fileName: string) =>
      services.storage.presignDownload({ key, fileName }, EXPORT_LINK_SECONDS);
    const parts = [];
    for (let part = 1; part <= row.partCount; part += 1) {
      parts.push({ part, url: await link(exportPartKey(row, part), `export-${row.id}-${String(part)}.jsonl`) });
    }
    const copied = await tx.platformExportFile.findMany({
      where: { exportId: row.id },
      orderBy: { attachmentId: "asc" },
      select: { attachmentId: true },
    });
    const files = [];
    for (const { attachmentId } of copied) {
      files.push({ fileId: attachmentId, url: await link(exportFileKey(row, attachmentId), attachmentId) });
    }
    await recordPlatformAudit(tx, staff, {
      action: "organization.export-downloaded",
      targetType: "organization",
      targetId: row.targetOrganizationId,
      targetOrganizationId: row.targetOrganizationId,
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
