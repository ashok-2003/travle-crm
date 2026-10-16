// A record's files: listing them, removing one (a soft delete), and the organization's storage used.
import type { AttachmentRefInput, AttachmentSummary } from "@travel-crm/contracts/files";
import { softDeleted } from "@travel-crm/db";
import { DomainError, type Actor } from "../kernel/index.js";
import {
  attachmentFields,
  canViewSensitive,
  findAttachment,
  isSystemOwnedRecordType,
  summaryFor,
} from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
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
