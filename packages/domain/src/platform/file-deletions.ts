// Deleting the stored files a purge or an erasure queued (ADR 0022). Their transaction can't reach storage, so it puts
// the files in the deletions' outbox; once it commits, this deletes each file, then its row, and the console's job
// retries until the outbox is empty. Nothing is lost to a storage error or a restart: the rows stay until the bytes go,
// each run queues the next for what is left, and an hourly sweep catches anything a lost job left behind.
import { describeError, ownMessages, type JobData } from "@travel-crm/integrations/jobs";
import { deleteQueuedFile, dueFileDeletions, forgetFileDeletion, nextFileDeletionDue } from "../files/index.js";
import { listenerJobId, type JobHandler, type ScheduledJob } from "../jobs/index.js";
import { isUuid } from "../kernel/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { platformLog } from "./merge-stand-ins.js";
import type { PlatformServices } from "./services.js";

export const DELETE_STORED_FILES_QUEUE = "platform.delete-stored-files";

/** The hourly sweep's own queue: a queue has one kind of work, and the handler above is the outbox job's. */
export const SWEEP_STORED_FILES_QUEUE = "platform.sweep-stored-files";

/**
 * Some queued files couldn't be deleted in a run: their rows stay, and the job is retried. The message holds counts
 * only; the storage errors are kept, the first as the cause.
 */
export class FileDeletionsFailedError extends AggregateError {
  static {
    ownMessages(this);
  }

  override readonly name = "FileDeletionsFailedError";

  constructor(errors: readonly unknown[], finished: number) {
    super(errors, `${String(errors.length)} queued file deletions failed and ${String(finished)} finished`, {
      cause: errors[0],
    });
  }
}

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
 * row. Only one organization's when it is given; every organization's otherwise. Returns how many it finished. A file
 * storage refuses holds up no other: its row stays, the run goes on, and then fails with FileDeletionsFailedError.
 *
 * A folder row means its organization was purged: its webhook events are tombstoned again with it, catching any that
 * a handler found since the purge (a retry that failed on the missing organization).
 */
export async function deleteDueFiles(
  services: PlatformServices,
  options: { now: Date; organizationId?: string },
): Promise<number> {
  let finished = 0;
  const failed: unknown[] = [];
  const failedIds: string[] = [];
  for (;;) {
    const due = await services.platformDb.transaction((tx) =>
      dueFileDeletions(tx, { ...options, limit: BATCH, exceptIds: failedIds }),
    );
    for (const deletion of due) {
      try {
        if (deletion.attachmentId === null) {
          await services.platformDb.transaction((tx) =>
            tombstoneWebhookEvents(tx, deletion.organizationId, { organizationGone: true }),
          );
        }
        await deleteQueuedFile(services.storage, deletion);
        await services.platformDb.transaction((tx) => forgetFileDeletion(tx, deletion.id));
        finished += 1;
      } catch (error) {
        failed.push(error);
        failedIds.push(deletion.id);
      }
    }
    if (due.length < BATCH) break;
  }
  if (failed.length > 0) throw new FileDeletionsFailedError(failed, finished);
  return finished;
}

/**
 * Queues the outbox job for the next queued deletion (the organization's, or anyone's), to start once it is due. Its
 * data names the organization, so that run works on it alone. One job per organization and due time: its id is made
 * from both, so the purge's own send and a run's follow-up for the same row are one job, and a run that finds the row
 * not yet due (pg-boss started it early) can't queue itself again and again.
 */
async function queueNextRun(services: PlatformServices, now: Date, organizationId?: string): Promise<void> {
  const next = await services.platformDb.transaction((tx) => nextFileDeletionDue(tx, organizationId));
  if (next === null) return;
  const startAfter = new Date(Math.max(next.getTime(), now.getTime()) + CLOCK_MARGIN_MS);
  const id = listenerJobId(
    DELETE_STORED_FILES_QUEUE,
    `${organizationId ?? "every organization"} ${next.toISOString()}`,
  );
  const data = organizationId === undefined ? {} : { organizationId };
  await services.queue.send(DELETE_STORED_FILES_QUEUE, data, { ...RETRIES, startAfter, id });
}

/** The organization a job's data names, if it names one: `{ organizationId }`, from queueNextRun. */
function scopeOf(data: JobData): { organizationId?: string } {
  return typeof data.organizationId === "string" && isUuid(data.organizationId)
    ? { organizationId: data.organizationId }
    : {};
}

/**
 * One run of the outbox: deletes what is due by `now` (one organization's, or every one's), then queues the next run
 * for what is left. A failure is thrown, and the job is retried.
 */
export async function runStoredFileDeletions(
  services: PlatformServices,
  options: { now: Date; organizationId?: string },
): Promise<void> {
  await deleteDueFiles(services, options);
  await queueNextRun(services, options.now, options.organizationId);
}

/**
 * Right after a purge or an erasure commits: deletes the organization's due files at once, then queues the job for
 * whatever is still in the outbox (a purge's later sweep, or what storage refused just now), to start when it is due.
 * A failure here is logged, not thrown: the rows stay in the outbox, and the job retries them until storage answers.
 */
export async function deleteFilesAfterCommit(
  services: PlatformServices,
  organizationId: string,
  now: Date,
): Promise<void> {
  try {
    await deleteDueFiles(services, { now, organizationId });
  } catch (error) {
    platformLog(services)(
      `${DELETE_STORED_FILES_QUEUE}: organization ${organizationId}'s files are left to the job (${describeError(error)})`,
    );
  }
  await queueNextRun(services, now, organizationId);
}

/**
 * The console's handler: the due deletions of the organization its data names (every organization's when it names
 * none), then the next run for what is left.
 */
export function deleteStoredFilesHandler(services: PlatformServices): JobHandler {
  return {
    queue: DELETE_STORED_FILES_QUEUE,
    handle: (data) => runStoredFileDeletions(services, { now: new Date(), ...scopeOf(data) }),
  };
}

/**
 * The hourly backstop, for the console's schedules: one run over every organization, for rows whose job was lost (a
 * crash before the send) or ran out of retries.
 */
export function storedFileDeletionsSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: SWEEP_STORED_FILES_QUEUE,
    cron: "0 * * * *",
    timeZone: "Asia/Kolkata",
    handle: () => runStoredFileDeletions(services, { now: new Date() }),
  };
}
