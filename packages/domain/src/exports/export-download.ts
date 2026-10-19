// Downloading an export (B42): by its requester only, through a 5-minute link, for 24 hours after it was ready; each
// download is an audit entry (export.downloaded), because the file holds customers' phone numbers.
import type { ExportKind } from "@travel-crm/contracts/exports";
import type { Database } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DATA_EXPORT_RECORD_TYPE, type DownloadLink, type Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { findExport } from "./export-row.js";

export async function exportDownloadLink(
  db: Database,
  files: Files,
  access: MemberAccess,
  kind: ExportKind,
  exportId: string,
  now: Date,
): Promise<DownloadLink> {
  const row = await db.forOrg(access.organizationId, (tx) => findExport(tx, access, kind, exportId));
  const lapsed = row.expiresAt !== null && row.expiresAt.getTime() < now.getTime();
  if (row.status === "expired" || lapsed) {
    throw new DomainError("CONFLICT", "EXPORT_EXPIRED", "This export has expired: ask for a new one");
  }
  if (row.status !== "ready" || row.fileAttachmentId === null) {
    throw new DomainError("CONFLICT", "EXPORT_NOT_READY", "This export isn't finished");
  }
  const link = await files.downloadLink(access, {
    recordType: DATA_EXPORT_RECORD_TYPE,
    recordId: exportId,
    attachmentId: row.fileAttachmentId,
  });
  await db.forOrg(access.organizationId, (tx) =>
    recordAudit(tx, access, {
      action: "export.downloaded",
      entityType: "data_export",
      entityId: exportId,
      after: { kind, format: row.format },
    }),
  );
  return link;
}
