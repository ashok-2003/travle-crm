// How the files module reads an attachment row, where its bytes live, and what callers see of it.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

/** The columns the module reads. */
export const attachmentFields = {
  organizationId: true,
  id: true,
  recordType: true,
  recordId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  sensitive: true,
  status: true,
  createdAt: true,
} as const;

export interface AttachmentRow {
  organizationId: string;
  id: string;
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sensitive: boolean;
  status: string;
  createdAt: Date;
}

/**
 * Where an attachment's bytes live. Made from the row's own organization and id, never stored, so no row can point
 * at another organization's file.
 */
export function storageKeyOf(row: { organizationId: string; id: string }): string {
  return `organizations/${row.organizationId}/attachments/${row.id}`;
}

export function toSummary(row: AttachmentRow): AttachmentSummary {
  return {
    id: row.id,
    recordType: row.recordType,
    recordId: row.recordId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sensitive: row.sensitive,
    status: row.status === "ready" ? "ready" : "pending",
    createdAt: row.createdAt.toISOString(),
  };
}

/** One of this organization's live attachments. Row-level security makes another organization's "not found". */
export async function findAttachment(tx: OrgTx, attachmentId: string): Promise<AttachmentRow> {
  const row = await tx.attachment.findUnique({ where: { id: attachmentId }, select: attachmentFields });
  if (!row) throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
  return row;
}
