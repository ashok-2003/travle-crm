// A data_export row as the module reads it, its fixed values typed by their contract's lists, and finding one: an
// export is its requester's alone, another person's, kind's or organization's is not found.
import type { ExportFailureReason, ExportFormat, ExportKind, ExportStatus } from "@travel-crm/contracts/exports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export interface DataExportRow {
  organizationId: string;
  id: string;
  kind: ExportKind;
  format: ExportFormat;
  status: ExportStatus;
  filter: unknown;
  failureReason: ExportFailureReason | null;
  rowsTotal: number;
  rowsDone: number;
  fileAttachmentId: string | null;
  requestedBy: string;
  impersonatedBy: string | null;
  createdAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
}

type StoredExport = NonNullable<Awaited<ReturnType<OrgTx["dataExport"]["findFirst"]>>>;

export function toExportRow(row: StoredExport): DataExportRow {
  return {
    ...row,
    kind: row.kind as ExportKind,
    format: row.format as ExportFormat,
    status: row.status as ExportStatus,
    failureReason: row.failureReason as ExportFailureReason | null,
  };
}

export async function findExport(
  tx: OrgTx,
  access: MemberAccess,
  kind: ExportKind,
  exportId: string,
): Promise<DataExportRow> {
  const row = await tx.dataExport.findFirst({ where: { id: exportId, kind, requestedBy: access.userId } });
  if (!row) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such export");
  return toExportRow(row);
}

/** The export's row, locked (FOR NO KEY UPDATE, M4) until the transaction ends, so two runs of its job take turns. */
export async function holdExport(tx: OrgTx, exportId: string): Promise<DataExportRow | null> {
  await tx.$queryRaw`SELECT id FROM data_export WHERE id = ${exportId}::uuid FOR NO KEY UPDATE`;
  const row = await tx.dataExport.findUnique({ where: { id: exportId } });
  return row === null ? null : toExportRow(row);
}
