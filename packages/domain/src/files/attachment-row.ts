// How the files module reads an attachment row, where its bytes live, and what callers see of it.
import type { AttachmentRefInput, AttachmentSummary } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
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
  storedAsId: true,
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
  /** The attachment whose stored object holds this file's bytes; null when it holds its own. */
  storedAsId: string | null;
}

/**
 * The attachment's own object: where its upload or a generated file is written, and what the deletions' outbox
 * deletes. Made from the row's own organization and id, never stored, so no row can point at another organization's
 * file. Reads go through `bytesKeyOf`: a file sent again has no object of its own.
 */
export function storageKeyOf(row: { organizationId: string; id: string }): string {
  return `organizations/${row.organizationId}/attachments/${row.id}`;
}

/**
 * Where the attachment's bytes are read from: its own object, or, for a file stored once and attached again (a
 * brochure sent on WhatsApp), the object of the attachment holding them, always in the row's own organization (the
 * key between them includes it).
 */
export function bytesKeyOf(row: { organizationId: string; id: string; storedAsId: string | null }): string {
  return storageKeyOf({ organizationId: row.organizationId, id: row.storedAsId ?? row.id });
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

/** What people without documents:view_sensitive see in place of a sensitive file's name. */
export const SENSITIVE_FILE_NAME = "Sensitive file";

/** Whether the actor is a member holding documents:view_sensitive. The system (no permissions) is not. */
export function canViewSensitive(actor: Actor): boolean {
  return "permissions" in actor && (actor as MemberAccess).permissions.has("documents:view_sensitive");
}

/** What the actor may see of the row: a sensitive file's real name only if they may open it. */
export function summaryFor(actor: Actor, row: AttachmentRow): AttachmentSummary {
  return toSummary(row.sensitive && !canViewSensitive(actor) ? { ...row, fileName: SENSITIVE_FILE_NAME } : row);
}

/**
 * One of this organization's live attachments, found through the record it belongs to: a file of another record is
 * "not found", so a caller that checked access to one record can't be handed another's file. Row-level security makes
 * another organization's file "not found" too.
 */
export async function findAttachment(tx: OrgTx, ref: AttachmentRefInput): Promise<AttachmentRow> {
  const row = await tx.attachment.findFirst({
    where: { id: ref.attachmentId, recordType: ref.recordType, recordId: ref.recordId },
    select: attachmentFields,
  });
  if (!row) throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
  return row;
}

/** One of this organization's live attachments by id alone, for server code that has no record to name. */
export async function findAttachmentById(tx: OrgTx, attachmentId: string): Promise<AttachmentRow> {
  const row = await tx.attachment.findUnique({ where: { id: attachmentId }, select: attachmentFields });
  if (!row) throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
  return row;
}
