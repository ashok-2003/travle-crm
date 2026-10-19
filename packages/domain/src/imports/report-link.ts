// Downloading an import's report (B36): an export, so on a fresh session in the router and in the audit log, through a
// 5-minute link. Before the add ends there's none yet; once swept, its file is gone for good.
import type { ImportKind } from "@travel-crm/contracts/imports";
import type { Database } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { type DownloadLink, type Files, IMPORT_REPORT_RECORD_TYPE } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { findImport } from "./batches.js";

export async function importReportLink(
  db: Database,
  files: Files,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
): Promise<DownloadLink> {
  const batch = await db.forOrg(access.organizationId, (tx) => findImport(tx, access, kind, importId));
  if (batch.status === "expired") {
    throw new DomainError("CONFLICT", "EXPORT_EXPIRED", "This report was deleted with the import's file");
  }
  if (batch.reportAttachmentId === null) throw new DomainError("CONFLICT", "EXPORT_NOT_READY", "There's no report yet");
  const link = await files.downloadLink(access, {
    recordType: IMPORT_REPORT_RECORD_TYPE,
    recordId: importId,
    attachmentId: batch.reportAttachmentId,
  });
  await db.forOrg(access.organizationId, (tx) =>
    recordAudit(tx, access, {
      action: "import.report-downloaded",
      entityType: "import_batch",
      entityId: importId,
      after: { kind },
    }),
  );
  return link;
}
