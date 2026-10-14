// A record's files: listing them, removing one (a soft delete), and the organization's storage used.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { softDeleted } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { attachmentFields, findAttachment, toSummary } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { bytesStored } from "./uploads.js";

/** The record's ready files, oldest first. Sensitive ones are listed, marked, so staff know they exist. */
export async function listAttachments(
  { db }: FilesDependencies,
  actor: Actor,
  record: { recordType: string; recordId: string },
): Promise<AttachmentSummary[]> {
  return db.forOrg(actor.organizationId, async (tx) => {
    const rows = await tx.attachment.findMany({
      where: { recordType: record.recordType, recordId: record.recordId, status: "ready" },
      select: attachmentFields,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toSummary);
  });
}

/** Hides the file (ADR 0004). Its bytes stay in storage, and count, until the platform's purge. */
export async function removeAttachment(
  { db }: FilesDependencies,
  actor: Actor,
  input: { attachmentId: string },
): Promise<void> {
  await db.forOrg(actor.organizationId, async (tx) => {
    await findAttachment(tx, input.attachmentId);
    await tx.attachment.update({
      where: { id: input.attachmentId },
      data: actor.userId === null ? { deletedAt: new Date(), deletedBy: null } : softDeleted(actor.userId),
    });
  });
}

export async function storageUsedBytes({ db }: FilesDependencies, organizationId: string): Promise<number> {
  return db.forOrg(organizationId, bytesStored);
}
