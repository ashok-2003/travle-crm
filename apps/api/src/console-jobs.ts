// What the console process runs besides its HTTP app (ADR 0018): the platform's own jobs (purging an organization,
// erasing a person or a record) and, when a demo is set, its nightly reset. They need the platform role, which only
// this process holds. No listeners and no outbox relay: those are the worker's.
import { startJobHandlers, type JobHandler, type ScheduledJob } from "@travel-crm/domain/jobs";
import {
  platformJobHandlers,
  RESET_DEMO_QUEUE,
  resetDemoOrganization,
  type DemoSettings,
  type PlatformServices,
} from "@travel-crm/domain/platform";
import type { JobRunner } from "@travel-crm/integrations/jobs";

export interface ConsoleJobs {
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

export function consoleJobs(services: PlatformServices, demo: DemoSettings | null): ConsoleJobs {
  return {
    handlers: platformJobHandlers(services),
    schedules:
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
          ],
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
