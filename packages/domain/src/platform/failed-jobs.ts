// The failed-jobs list (spec 9.1: "after the last retry, a job lands in a failed-jobs list in the platform console"),
// and the schedules a removed job left behind (ADR 0010), which a super admin removes. pg-boss acts on its own
// connection, outside any transaction of ours, so each action is logged first, in a transaction of its own, and a
// failure is logged after it: no retry or removal goes unlogged.
import type { FailedJobsPage, ListFailedJobsInput, RetryFailedJobInput } from "@travel-crm/contracts/platform";
import { describeError } from "@travel-crm/integrations/jobs";
import { errorFields } from "@travel-crm/integrations/logging";
import { DomainError } from "../kernel/index.js";
import { ADVANCE_SUBSCRIPTIONS_QUEUE } from "../subscriptions/index.js";
import { SWEEP_AI_INPUTS_QUEUE } from "./ai-inputs-sweep.js";
import { SWEEP_BULK_FILES_QUEUE } from "./bulk-files-sweep.js";
import { RESET_DEMO_QUEUE } from "./demo.js";
import { ERASE_SUBJECT_QUEUE } from "./erasure.js";
import { SWEEP_STORED_FILES_QUEUE } from "./file-deletions.js";
import { EXPORT_ORGANIZATION_QUEUE, SWEEP_EXPIRED_EXPORTS_QUEUE } from "./organization-export.js";
import { recordPlatformAudit, type PlatformChange } from "./platform-log.js";
import { PURGE_ORGANIZATION_QUEUE } from "./purge.js";
import { SWEEP_META_QUEUE } from "./meta-sweep.js";
import { SWEEP_SHEETS_QUEUE } from "./sheets-sweep.js";
import { SWEEP_WHATSAPP_QUEUE } from "./whatsapp-sweep.js";
import { WEBSITE_FORMS_SWEEP_QUEUE } from "./website-forms-sweep.js";
import type { PlatformServices } from "./services.js";

/**
 * The platform's own jobs that delete or hand over an organization's data. Their checks (the code typed, cancelled,
 * an export from the last day, who asked) are made when a super admin asks; a retry, days later and by anyone, would
 * skip them. So a failed one is asked for again, which checks everything again.
 */
const ASKED_FOR_AGAIN_QUEUES: ReadonlySet<string> = new Set([
  PURGE_ORGANIZATION_QUEUE,
  ERASE_SUBJECT_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
]);

/**
 * The schedules the console registers at every start (apps/api's console-jobs.ts, whose test checks every one is
 * here). Removing one would only stop it until the next start, a sweep the deletions or the exports rely on among them.
 */
const CONSOLE_SCHEDULES: ReadonlySet<string> = new Set([
  ADVANCE_SUBSCRIPTIONS_QUEUE,
  SWEEP_STORED_FILES_QUEUE,
  SWEEP_EXPIRED_EXPORTS_QUEUE,
  SWEEP_BULK_FILES_QUEUE,
  SWEEP_AI_INPUTS_QUEUE,
  SWEEP_SHEETS_QUEUE,
  SWEEP_META_QUEUE,
  SWEEP_WHATSAPP_QUEUE,
  WEBSITE_FORMS_SWEEP_QUEUE,
  RESET_DEMO_QUEUE,
]);

/**
 * Logs the action in a transaction of its own, then takes it, so nothing is done that the log doesn't show; if the
 * action fails, or `act` finds nothing to act on and says why, logs that too (`failedAction`), then throws.
 */
async function loggedAction(
  services: PlatformServices,
  staff: { userId: string },
  change: PlatformChange & { failedAction: string },
  act: () => Promise<DomainError | null>,
): Promise<void> {
  const { failedAction, ...entry } = change;
  await services.platformDb.transaction((tx) => recordPlatformAudit(tx, staff, entry));
  try {
    const refusal = await act();
    if (refusal) throw refusal;
  } catch (error) {
    const failure = error instanceof DomainError ? error.reason : describeError(error);
    await services.platformDb
      .transaction((tx) =>
        recordPlatformAudit(tx, staff, { ...entry, action: failedAction, after: { ...entry.after, failure } }),
      )
      .catch((logError: unknown) => {
        services.logger.error(
          { action: failedAction, targetId: entry.targetId, ...errorFields(logError) },
          "A failed platform action could not be logged",
        );
      });
    throw error;
  }
}

/** A page of failed jobs, newest first; the next page starts after its last job. */
export async function listFailedJobs(services: PlatformServices, input: ListFailedJobsInput): Promise<FailedJobsPage> {
  const { after } = input;
  // One more than the page, to know whether another page follows.
  const found = await services.jobs.failedJobs({
    limit: input.limit + 1,
    ...(after ? { after: { id: after.id, failedAt: after.failedAt === null ? null : new Date(after.failedAt) } } : {}),
    ...(input.queue === undefined ? {} : { queue: input.queue }),
  });
  const jobs = found.slice(0, input.limit).map((job) => ({ ...job, failedAt: job.failedAt?.toISOString() ?? null }));
  const last = jobs.at(-1);
  return { jobs, nextCursor: found.length > input.limit && last ? { id: last.id, failedAt: last.failedAt } : null };
}

/**
 * Gives a failed job one more attempt (pg-boss's retry: one attempt, not a new series of retries), logged first in
 * the platform log, with a second entry when pg-boss refuses it or no longer holds it. Refused, with nothing logged,
 * for the platform's purge, erasure and export, which are asked for again instead.
 */
export async function retryFailedJob(
  services: PlatformServices,
  staff: { userId: string },
  input: RetryFailedJobInput,
): Promise<void> {
  if (ASKED_FOR_AGAIN_QUEUES.has(input.queue)) {
    throw new DomainError(
      "CONFLICT",
      "NOT_RETRYABLE",
      "A purge, an erasure or an export isn't retried: ask for it again, so that every check is made again",
    );
  }
  await loggedAction(
    services,
    staff,
    {
      action: "job.retried",
      failedAction: "job.retry-failed",
      targetType: "job",
      targetId: input.jobId,
      after: { queue: input.queue },
    },
    async () =>
      (await services.jobs.retryFailedJob(input.queue, input.jobId))
        ? null
        : new DomainError("NOT_FOUND", "FAILED_JOB_NOT_FOUND", "There is no such failed job (any more)"),
  );
}

export async function listSchedules(services: PlatformServices) {
  return services.jobs.schedules();
}

/**
 * Stops a schedule whose job the code no longer has, logged first, with a second entry if pg-boss refuses. Super admins
 * only. Never one the console registers itself (SCHEDULE_IS_THE_CONSOLES), which would be back at the next start.
 */
export async function removeSchedule(
  services: PlatformServices,
  staff: { userId: string },
  queue: string,
): Promise<void> {
  if (CONSOLE_SCHEDULES.has(queue)) {
    throw new DomainError(
      "CONFLICT",
      "SCHEDULE_IS_THE_CONSOLES",
      "The console schedules this job at every start: removing it would only stop it until the next",
    );
  }
  await loggedAction(
    services,
    staff,
    { action: "schedule.removed", failedAction: "schedule.removal-failed", targetType: "job", targetId: queue },
    async () => {
      await services.jobs.unschedule(queue);
      return null;
    },
  );
}
