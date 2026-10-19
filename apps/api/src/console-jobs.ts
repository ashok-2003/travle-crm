// What the console process runs besides its HTTP app (ADR 0019): the platform's own jobs (purging an organization,
// erasing a person or a record, exporting one, deleting stored files), the nightly subscription lifecycle, the hourly
// sweep of stored files still to delete, the daily sweep of exports past their time, the hourly sweep of imports' and
// exports' files past theirs and, when a demo is set, its nightly reset. They need the platform role, which only this
// process holds. No listeners and no outbox relay: those are the worker's.
import { startJobHandlers, type JobHandler, type ScheduledJob } from "@travel-crm/domain/jobs";
import {
  bulkFilesSweepSchedule,
  expiredExportsSchedule,
  platformJobHandlers,
  RESET_DEMO_QUEUE,
  resetDemoOrganization,
  storedFileDeletionsSchedule,
  type DemoSettings,
  type PlatformServices,
} from "@travel-crm/domain/platform";
import { ADVANCE_SUBSCRIPTIONS_QUEUE, advanceSubscriptions } from "@travel-crm/domain/subscriptions";
import { describeError, type JobRunner } from "@travel-crm/integrations/jobs";

export interface ConsoleJobs {
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

/** The jobs report each organization they couldn't handle to the services' log, the console's own (ids and codes). */
export function consoleJobs(services: PlatformServices, demo: DemoSettings | null): ConsoleJobs {
  const lifecycle: ScheduledJob = {
    // Just after midnight in India, where most agencies' day starts: a trial that ended yesterday there is recorded
    // as past due before anyone signs in. An agency in a zone west of India is recorded up to a day later; the
    // request checks and the console compute its state on every read anyway (spec 7.3), so this only writes it down
    // for the console and the audit log. One organization failing doesn't stop the rest: the log gets its id and the
    // error's names and codes, and the run then fails, naming it, so pg-boss records it and retries.
    queue: ADVANCE_SUBSCRIPTIONS_QUEUE,
    cron: "15 0 * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await advanceSubscriptions({
        db: services.platformDb,
        onError: (error, organizationId) => {
          services.log(
            `${ADVANCE_SUBSCRIPTIONS_QUEUE}: organization ${organizationId} failed: ${describeError(error)}`,
          );
        },
      });
    },
  };
  const demoReset: ScheduledJob[] =
    demo === null
      ? []
      : [
          {
            // Nightly (spec 7.4), at 02:00 India time, when no agency is at work.
            queue: RESET_DEMO_QUEUE,
            cron: "0 2 * * *",
            timeZone: "Asia/Kolkata",
            handle: async () => {
              await resetDemoOrganization(services, demo);
            },
          },
        ];
  // Required beside the deletions' own job: pg-boss drops a follow-up whose id it already holds, and a job lost before
  // it was sent, or out of retries, would leave its outbox rows for good (ADR 0023).
  const storedFilesSweep = storedFileDeletionsSchedule(services);
  // Required beside each export's own expiry job for the same reason: one job out of retries would leave its parts
  // and file copies stored for good (ADR 0023).
  const expiredExportsSweep = expiredExportsSchedule(services);
  // Imports' and exports' files past their time (B53, B54): no job of their own deletes them.
  const bulkFilesSweep = bulkFilesSweepSchedule(services);
  return {
    handlers: platformJobHandlers(services),
    schedules: [lifecycle, storedFilesSweep, expiredExportsSweep, bulkFilesSweep, ...demoReset],
  };
}

/** Registers the console's jobs with the runner (pg-boss). Stop the runner to stop them. */
export async function startConsoleJobs(
  runner: JobRunner,
  services: PlatformServices,
  demo: DemoSettings | null,
): Promise<void> {
  // pg-boss keeps a schedule across restarts: with the demo switched off, last start's schedule goes too.
  if (demo === null) await runner.unschedule(RESET_DEMO_QUEUE);
  await startJobHandlers({ runner, ...consoleJobs(services, demo) });
}
