// Deleting the stored files a purge or an erasure queued (ADR 0022). Their transaction can't reach storage, so it puts
// the files in the deletions' outbox; once it commits, this deletes each file, then its row, and the console's job
// retries until the outbox is empty. Nothing is lost to a storage error or a restart: the rows stay until the bytes go.
import { deleteQueuedFile, dueFileDeletions, forgetFileDeletion, nextFileDeletionDue } from "../files/index.js";
import type { JobHandler } from "../jobs/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import type { PlatformServices } from "./services.js";

export const DELETE_STORED_FILES_QUEUE = "platform.delete-stored-files";

/**
 * About a day of retries, then the failed-jobs list: 30, 1 minute apart at first and doubling to the queue's longest
 * wait (an hour). A storage outage that outlasts them leaves the rows for the next run, which a retry from the list
 * starts.
 */
const RETRIES = { retryLimit: 30, retryDelaySeconds: 60 };

/** pg-boss starts a job on the database's clock and this checks it on the console's: a minute absorbs the drift. */
const CLOCK_MARGIN_MS = 60 * 1000;

const BATCH = 100;

/**
 * Deletes the queued files due by `now`, oldest first: each file (or a purged organization's whole folder), then its
 * row. Only one organization's when it is given; every organization's otherwise. Returns how many it finished.
 *
 * A folder row means its organization was purged: its webhook events are tombstoned again with it, catching any that
 * a handler found since the purge (a retry that failed on the missing organization).
 */
export async function deleteDueFiles(
  services: PlatformServices,
  options: { now: Date; organizationId?: string },
): Promise<number> {
  let finished = 0;
  for (;;) {
    const due = await services.platformDb.transaction((tx) => dueFileDeletions(tx, { ...options, limit: BATCH }));
    for (const deletion of due) {
      if (deletion.attachmentId === null) {
        await services.platformDb.transaction((tx) =>
          tombstoneWebhookEvents(tx, deletion.organizationId, { organizationGone: true }),
        );
      }
      await deleteQueuedFile(services.storage, deletion);
      await services.platformDb.transaction((tx) => forgetFileDeletion(tx, deletion.id));
      finished += 1;
    }
    if (due.length < BATCH) return finished;
  }
}

/**
 * Right after a purge or an erasure commits: deletes the organization's due files at once, then queues the job for
 * whatever is still in the outbox (a purge's later sweep, or what storage refused just now), to start when it is due.
 */
export async function deleteFilesAfterCommit(
  services: PlatformServices,
  organizationId: string,
  now: Date,
): Promise<void> {
  try {
    await deleteDueFiles(services, { now, organizationId });
  } catch {
    // Not lost: the rows stay in the outbox, and the job queued below deletes them, retrying until storage answers.
  }
  const next = await services.platformDb.transaction((tx) => nextFileDeletionDue(tx, organizationId));
  if (next !== null) {
    const startAfter = new Date(Math.max(next.getTime(), now.getTime()) + CLOCK_MARGIN_MS);
    await services.queue.send(DELETE_STORED_FILES_QUEUE, {}, { ...RETRIES, startAfter });
  }
}

/** The console's handler: every organization's due deletions. A failure is retried, and a later run finishes it. */
export function deleteStoredFilesHandler(services: PlatformServices): JobHandler {
  return {
    queue: DELETE_STORED_FILES_QUEUE,
    handle: async () => {
      await deleteDueFiles(services, { now: new Date() });
    },
  };
}
