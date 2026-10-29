// A record's files: listing them, removing one (a soft delete), and the organization's storage used.
import type { AttachmentRefInput, AttachmentSummary } from "@travel-crm/contracts/files";
import { softDeleted } from "@travel-crm/db";
import { DomainError, type Actor } from "../kernel/index.js";
import { attachmentFields, canViewSensitive, findAttachment, summaryFor } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { isSystemOwnedRecordType } from "./record-types.js";
import { bytesStored } from "./uploads.js";

/**
 * The record's ready files, oldest first by when they arrived (confirmed), so two uploads that overlap end in the
 * order the uploader saw them finish. Sensitive ones are listed, marked, so staff know they exist; their names (a
 * passport's holder) are shown only to members holding documents:view_sensitive, and the system sees none.
 */
export async function listAttachments(
  { db }: FilesDependencies,
  actor: Actor,
  record: { recordType: string; recordId: string },
): Promise<AttachmentSummary[]> {
  return db.forOrg(actor.organizationId, async (tx) => {
    const rows = await tx.attachment.findMany({
      where: { recordType: record.recordType, recordId: record.recordId, status: "ready" },
      select: attachmentFields,
      orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => summaryFor(actor, row));
  });
}

/** The ready files of many records of one type in one query, by record id (a record with none has no entry). */
export async function listAttachmentsOfRecords(
  { db }: FilesDependencies,
  actor: Actor,
  recordType: string,
  recordIds: readonly string[],
): Promise<Map<string, AttachmentSummary[]>> {
  const byRecord = new Map<string, AttachmentSummary[]>();
  if (recordIds.length === 0) return byRecord;
  const rows = await db.forOrg(actor.organizationId, (tx) =>
    tx.attachment.findMany({
      where: { recordType, recordId: { in: [...recordIds] }, status: "ready" },
      select: attachmentFields,
      orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
    }),
  );
  for (const row of rows) byRecord.set(row.recordId, [...(byRecord.get(row.recordId) ?? []), summaryFor(actor, row)]);
  return byRecord;
}

/**
 * Hides the file (ADR 0004). Its bytes stay in storage, and count, until the platform's purge. A sensitive file is
 * removed only by a member holding documents:view_sensitive; a file of a system-owned record type, by no one.
 */
export async function removeAttachment(
  { db }: FilesDependencies,
  actor: Actor,
  input: AttachmentRefInput,
): Promise<void> {
  await db.forOrg(actor.organizationId, async (tx) => {
    const row = await findAttachment(tx, input);
    if (isSystemOwnedRecordType(row.recordType)) {
      throw new DomainError("FORBIDDEN", "SYSTEM_OWNED_FILE", "This file belongs to its record and can't be removed");
    }
    if (row.sensitive && !canViewSensitive(actor)) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
    }
    await tx.attachment.update({
      where: { id: input.attachmentId },
      data: actor.userId === null ? { deletedAt: new Date(), deletedBy: null } : softDeleted(actor.userId),
    });
  });
}

export async function storageUsedBytes({ db }: FilesDependencies, organizationId: string): Promise<number> {
  return db.forOrg(organizationId, (tx) => bytesStored(tx, organizationId));
}
