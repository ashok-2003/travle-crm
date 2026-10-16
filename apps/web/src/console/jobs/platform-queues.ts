// The platform's own queues the console's api treats apart (packages/domain/src/platform/failed-jobs.ts), named here
// because the screens may not import the domain; test/console/jobs/platform-queues.test.ts holds them to its names.

/** A failed purge, erasure or export is asked for again, never retried: its checks are made when a super admin asks. */
export const ASKED_FOR_AGAIN_QUEUES: ReadonlySet<string> = new Set([
  "platform.purge-organization",
  "platform.erase-subject",
  "platform.export-organization",
]);

/** The schedules the console registers at every start: a removal would only stop one until the next. */
export const CONSOLE_SCHEDULES: ReadonlySet<string> = new Set([
  "subscriptions.advance-lifecycle",
  "platform.sweep-stored-files",
  "platform.sweep-expired-exports",
  "platform.reset-demo",
]);
