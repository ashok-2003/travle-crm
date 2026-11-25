// The one-off clean-up (2026-11-25) of files stored more than once before a copy shared its holder's bytes: within one
// organization, ready files with the same name, size, type and stored bytes become copies of one of them, and the
// others' own objects go through the deletions' outbox. In platform transactions (the outbox is the platform role's),
// naming the organization in every query; the console's `dedupe-files` command runs it.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { storageKeyOf } from "./attachment-row.js";
import { DATA_EXPORT_RECORD_TYPE, IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE } from "./record-types.js";

/** A ready file holding its own bytes. */
export interface DuplicateCandidate {
  id: string;
  recordType: string;
  sizeBytes: number;
}

/** Files with the same bytes: the one that keeps them, and those that will share them. */
export interface DuplicateSet {
  holderId: string;
  sharerIds: string[];
  sizeBytes: number;
}

/** Short-lived files go within days by themselves, and nothing ever shares theirs. */
const SHORT_LIVED = [IMPORT_FILE_RECORD_TYPE, IMPORT_REPORT_RECORD_TYPE, DATA_EXPORT_RECORD_TYPE];

/** Storage lookups at a time. */
const HEADS_AT_ONCE = 16;

/** Download links last 5 minutes (downloads.ts): after this, none handed out for an object still works. */
const LINKS_LAPSED_MS = 10 * 60 * 1000;

/** The organizations that keep any file. */
export async function organizationsWithFiles(tx: OrgTx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ organizationId: string }[]>`
    SELECT DISTINCT organization_id AS "organizationId" FROM attachment ORDER BY 1`;
  return rows.map((row) => row.organizationId);
}

/**
 * The organization's ready files holding their own bytes, in groups of the same name, size and type, oldest first; only
 * groups of two or more. Removed files are in (they count until a purge); short-lived ones are not.
 */
export async function duplicateCandidates(tx: OrgTx, organizationId: string): Promise<DuplicateCandidate[][]> {
  const rows = await tx.$queryRaw<(DuplicateCandidate & { name: string; contentType: string })[]>`
    SELECT id, "recordType", "sizeBytes", name, "contentType" FROM (
      SELECT id, record_type AS "recordType", size_bytes AS "sizeBytes", file_name AS name, content_type AS "contentType",
        created_at, count(*) OVER (PARTITION BY file_name, size_bytes, content_type) AS namesakes
      FROM attachment
      WHERE organization_id = ${organizationId}::uuid AND status = 'ready' AND stored_as_id IS NULL
        AND record_type <> ALL(${SHORT_LIVED}::text[])
    ) files
    WHERE namesakes > 1
    ORDER BY name, "sizeBytes", "contentType", created_at, id`;
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const { name, contentType, ...file } of rows) {
    const key = JSON.stringify([name, file.sizeBytes, contentType]);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return [...groups.values()];
}

/**
 * The sets within these groups whose stored objects are byte-identical: equal ETags (the MD5 of a file stored in one
 * piece, kept by a copy) and the promised size. A file storage holds nothing for, or gives no ETag for, is left alone.
 * The holder is the oldest file not on a WhatsApp message (a record more likely to stay), else the oldest.
 */
export async function identicalSets(
  storage: ObjectStorage,
  organizationId: string,
  groups: readonly DuplicateCandidate[][],
): Promise<DuplicateSet[]> {
  const sets: DuplicateSet[] = [];
  for (const group of groups) {
    const byTag = new Map<string, DuplicateCandidate[]>();
    for (let start = 0; start < group.length; start += HEADS_AT_ONCE) {
      const slice = group.slice(start, start + HEADS_AT_ONCE);
      const heads = await Promise.all(slice.map((file) => storage.head(storageKeyOf({ organizationId, id: file.id }))));
      for (const [index, file] of slice.entries()) {
        const head = heads[index];
        if (!head?.etag || head.sizeBytes !== file.sizeBytes) continue;
        byTag.set(head.etag, [...(byTag.get(head.etag) ?? []), file]);
      }
    }
    for (const same of byTag.values()) {
      const holder = same.find((file) => file.recordType !== WHATSAPP_RECORD_TYPE) ?? same[0];
      if (holder === undefined || same.length < 2) continue;
      const sharerIds = same.filter((file) => file !== holder).map((file) => file.id);
      sets.push({ holderId: holder.id, sharerIds, sizeBytes: holder.sizeBytes });
    }
  }
  return sets;
}

/**
 * Makes the set's files share the holder's bytes, in the caller's platform transaction: each names the holder, so do the
 * copies made of it since (no chains), and its own object is queued for deletion once the links handed out for it
 * have lapsed (a WhatsApp send's link is fetched a moment after it is made). Read again under lock first: a file erased
 * or changed since is left out. Returns how many files now share.
 */
export async function shareStoredBytes(
  tx: OrgTx,
  organizationId: string,
  set: DuplicateSet,
  now: Date,
): Promise<number> {
  const still = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM attachment
    WHERE organization_id = ${organizationId}::uuid AND id = ANY(${[set.holderId, ...set.sharerIds]}::uuid[])
      AND status = 'ready' AND stored_as_id IS NULL
    FOR UPDATE`;
  const found = new Set(still.map((row) => row.id));
  const sharers = set.sharerIds.filter((id) => found.has(id));
  if (!found.has(set.holderId) || sharers.length === 0) return 0;
  await tx.$executeRaw`
    UPDATE attachment SET stored_as_id = ${set.holderId}::uuid
    WHERE organization_id = ${organizationId}::uuid AND id = ANY(${sharers}::uuid[])`;
  await tx.$executeRaw`
    UPDATE attachment SET stored_as_id = ${set.holderId}::uuid
    WHERE organization_id = ${organizationId}::uuid AND stored_as_id = ANY(${sharers}::uuid[])`;
  const dueAt = new Date(now.getTime() + LINKS_LAPSED_MS);
  await tx.storedFileDeletion.createMany({
    data: sharers.map((attachmentId) => ({ targetOrganizationId: organizationId, attachmentId, dueAt })),
  });
  return sharers.length;
}
