// The failed-jobs list (spec 9.1: "after the last retry, a job lands in a failed-jobs list in the platform console"),
// and the schedules a removed job left behind (ADR 0010), which a super admin removes.
import type { FailedJobsPage, ListFailedJobsInput, RetryFailedJobInput } from "@travel-crm/contracts/platform";
import { DomainError } from "../kernel/index.js";
import { ERASE_SUBJECT_QUEUE } from "./erasure.js";
import { EXPORT_ORGANIZATION_QUEUE } from "./organization-export.js";
import { recordPlatformAudit } from "./platform-log.js";
import { PURGE_ORGANIZATION_QUEUE } from "./purge.js";
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
 * Gives a failed job one more attempt (pg-boss's retry: one attempt, not a new series of retries), and says so in the
 * platform log. Refused for the platform's purge, erasure and export, which are asked for again instead.
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
  await services.platformDb.transaction(async (tx) => {
    if (!(await services.jobs.retryFailedJob(input.queue, input.jobId))) {
      throw new DomainError("NOT_FOUND", "FAILED_JOB_NOT_FOUND", "There is no such failed job (any more)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "job.retried",
      targetType: "job",
      targetId: input.jobId,
      after: { queue: input.queue },
    });
  });
}

export async function listSchedules(services: PlatformServices) {
  return services.jobs.schedules();
}

/** Stops a schedule, such as one whose job the code no longer has. Super admins only. */
export async function removeSchedule(
  services: PlatformServices,
  staff: { userId: string },
  queue: string,
): Promise<void> {
  await services.jobs.unschedule(queue);
  await services.platformDb.transaction((tx) =>
    recordPlatformAudit(tx, staff, { action: "schedule.removed", targetType: "job", targetId: queue }),
  );
}
