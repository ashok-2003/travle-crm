// Asking for an export and following it (spec 3.3, B41): the format and the list's filter as the person sent it
// (ADR 0028's payload kept as received, read back through its contract), export.requested for the worker, and what
// the export's page shows.
import type { ExportDetail, ExportFormat, ExportKind } from "@travel-crm/contracts/exports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { type EventPayload, publishEvent } from "../jobs/index.js";
import { findExport } from "./export-row.js";

export async function startExport(
  tx: OrgTx,
  access: MemberAccess,
  kind: ExportKind,
  /** The list's input as the person sent it: a JSON object. */
  request: { format: ExportFormat; filter: EventPayload },
  now: Date,
): Promise<{ exportId: string }> {
  const created = await tx.dataExport.create({
    data: {
      kind,
      format: request.format,
      filter: request.filter,
      requestedBy: access.userId,
      impersonatedBy: access.impersonatedBy,
      createdAt: now,
    },
    select: { id: true },
  });
  await publishEvent(tx, { type: "export.requested", payload: { exportId: created.id, kind } });
  return { exportId: created.id };
}

/** The export's page: its state, its file while kept, and the filter as stored (each kind's contract reads it). */
export async function exportDetail(
  tx: OrgTx,
  access: MemberAccess,
  kind: ExportKind,
  exportId: string,
): Promise<ExportDetail & { filter: unknown }> {
  const row = await findExport(tx, access, kind, exportId);
  const file =
    row.fileAttachmentId === null
      ? null
      : await tx.attachment.findUnique({
          where: { id: row.fileAttachmentId },
          select: { fileName: true, sizeBytes: true },
        });
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    status: row.status,
    failureReason: row.failureReason,
    rowsTotal: row.rowsTotal,
    rowsDone: row.rowsDone,
    file: file === null ? null : { fileName: file.fileName, sizeBytes: file.sizeBytes },
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    filter: row.filter,
  };
}
