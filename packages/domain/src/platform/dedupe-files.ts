// The one-off clean-up (2026-11-25) of files stored more than once before a copy shared its holder's bytes, for the
// console's `dedupe-files` command: per organization, the files module finds the files with identical bytes and makes
// them share one object, and the others' objects go through the deletions' outbox. A dry run only counts.
import {
  duplicateCandidates,
  holderSha256,
  identicalSets,
  organizationsWithFiles,
  shareStoredBytes,
  type DuplicateSet,
} from "../files/index.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import type { PlatformServices } from "./services.js";

/** What the clean-up did, or would do, in one organization: ids and counts only. */
export interface DedupeCount {
  organizationId: string;
  /** Files that share another's bytes now (or would). */
  files: number;
  /** The bytes their own objects held. */
  bytes: number;
}

/**
 * Every organization's duplicates (or one organization's), each set in its own short platform transaction, so a set
 * erased meanwhile holds back no other. With `apply` false nothing changes. Each organization's queued objects are
 * deleted by the outbox's job once their links have lapsed, which this queues.
 */
export async function dedupeStoredFiles(
  services: PlatformServices,
  options: { apply: boolean; organizationId?: string },
  now: Date = new Date(),
): Promise<DedupeCount[]> {
  const organizationIds =
    options.organizationId === undefined
      ? await services.platformDb.transaction((tx) => organizationsWithFiles(tx))
      : [options.organizationId];
  const counts: DedupeCount[] = [];
  for (const organizationId of organizationIds) {
    const groups = await services.platformDb.transaction((tx) => duplicateCandidates(tx, organizationId));
    const sets = await identicalSets(services.storage, organizationId, groups);
    const count = { organizationId, files: 0, bytes: 0 };
    for (const set of sets) {
      const shared = options.apply ? await share(services, organizationId, set, now) : set.sharerIds.length;
      count.files += shared;
      count.bytes += shared * set.sizeBytes;
    }
    if (options.apply && count.files > 0) await deleteFilesAfterCommit(services, organizationId, now);
    counts.push(count);
  }
  return counts;
}

/** One set made to share its holder's object, which keeps the bytes' hash: how many files share it now. */
async function share(
  services: PlatformServices,
  organizationId: string,
  set: DuplicateSet,
  now: Date,
): Promise<number> {
  const contentSha256 = await holderSha256(services.storage, organizationId, set);
  if (contentSha256 === null) return 0;
  return services.platformDb.transaction((tx) => shareStoredBytes(tx, organizationId, { ...set, contentSha256 }, now));
}
