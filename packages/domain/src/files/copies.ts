// A stored file attached to another record without storing it again: a trip's photo or PDF saved once (sales inbox, trip
// details) becomes the file of each WhatsApp message that sends it. The copy is a row of its own, which behaves in every
// way as if it held its own bytes, but it names the attachment whose object holds them (`storedAsId`), so it adds
// nothing to the organization's storage or its count, and storage copies nothing.
import type { AttachmentRefInput, AttachmentSummary } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { DomainError } from "../kernel/index.js";
import { attachmentFields, toSummary, type AttachmentRow } from "./attachment-row.js";
import type { FilesDependencies } from "./dependencies.js";
import { assertTypeAllowed } from "./uploads.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "The file is not stored");

export function copyFile(
  { db }: FilesDependencies,
  actor: Actor,
  from: AttachmentRefInput,
  to: { recordType: string; recordId: string },
): Promise<AttachmentSummary> {
  return db.forOrg(actor.organizationId, (tx) => copyFileIn(tx, actor, from, to));
}

/**
 * `copyFile` inside a transaction already open (the AI's turn sends its files in the one transaction that holds its
 * seats): if the transaction rolls back, the copy goes with it.
 */
export async function copyFileIn(
  tx: OrgTx,
  actor: Actor,
  from: AttachmentRefInput,
  to: { recordType: string; recordId: string },
): Promise<AttachmentSummary> {
  const source = await tx.attachment.findFirst({
    where: { id: from.attachmentId, recordType: from.recordType, recordId: from.recordId, status: "ready" },
    select: attachmentFields,
  });
  if (source === null) throw notFound();
  assertTypeAllowed(to.recordType, source.contentType);
  const storedAsId = await holderOf(tx, source);
  // The same copy asked for again (the caller names the record by its token, so a retry names the same one) finds the row
  // an earlier try made: a ready one is the answer, and a pending one (the copy in storage of before, which failed)
  // becomes a copy like this one.
  const earlier = await tx.attachment.findFirst({
    where: {
      recordType: to.recordType,
      recordId: to.recordId,
      fileName: source.fileName,
      contentType: source.contentType,
      sizeBytes: source.sizeBytes,
    },
    select: attachmentFields,
  });
  if (earlier?.status === "ready") return toSummary(earlier);
  const shared = { storedAsId, status: "ready", confirmedAt: new Date() };
  const copy =
    earlier === null
      ? await tx.attachment.create({
          data: {
            recordType: to.recordType,
            recordId: to.recordId,
            fileName: source.fileName,
            contentType: source.contentType,
            sizeBytes: source.sizeBytes,
            sensitive: source.sensitive,
            createdBy: actor.userId,
            ...shared,
          },
          select: attachmentFields,
        })
      : await tx.attachment.update({ where: { id: earlier.id }, data: shared, select: attachmentFields });
  return toSummary(copy);
}

/**
 * The attachment whose object holds the source's bytes: the source itself, or the one it names (never a chain). Read
 * under a share lock, so a deletion handing the bytes on, or the clean-up pointing the source elsewhere, finishes first,
 * and the copy then names where the bytes are now (or finds the source gone).
 */
async function holderOf(tx: OrgTx, source: AttachmentRow): Promise<string> {
  const [row] = await tx.$queryRaw<{ storedAsId: string | null }[]>`
    SELECT stored_as_id AS "storedAsId" FROM attachment
    WHERE organization_id = ${source.organizationId}::uuid AND id = ${source.id}::uuid
    FOR SHARE`;
  if (row === undefined) throw notFound();
  return row.storedAsId ?? source.id;
}
