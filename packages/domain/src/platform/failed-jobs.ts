// The failed-jobs list (spec 9.1: "after the last retry, a job lands in a failed-jobs list in the platform console"),
// and the schedules a removed job left behind (ADR 0010), which a super admin removes.
import type { FailedJobOutput, RetryFailedJobInput } from "@travel-crm/contracts/platform";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export async function listFailedJobs(services: PlatformServices, limit: number): Promise<FailedJobOutput[]> {
  return (await services.jobs.failedJobs({ limit })).map((job) => ({
    ...job,
    failedAt: job.failedAt?.toISOString() ?? null,
  }));
}

/** Runs a failed job again, and says so in the platform log. */
export async function retryFailedJob(
  services: PlatformServices,
  staff: { userId: string },
  input: RetryFailedJobInput,
): Promise<void> {
  await services.jobs.retryFailedJob(input.queue, input.jobId);
  await services.platformDb.transaction((tx) =>
    recordPlatformAudit(tx, staff, {
      action: "job.retried",
      targetType: "job",
      targetId: input.jobId,
      after: { queue: input.queue },
    }),
  );
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
