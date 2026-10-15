// Public API of @travel-crm/integrations/jobs: the jobs port and its adapters.
export { describeError } from "./describe-error.js";
export { assertQueueName, type JobData, type JobOptions, type JobQueue } from "./job-queue.js";
export type { JobHandlerFunction, JobRunner, RunningJob, ScheduleOptions } from "./job-runner.js";
export { createMemoryJobAdministration, type MemoryJobAdministration } from "./memory-job-administration.js";
export { createMemoryJobQueue, type MemoryJobQueue, type SentJob } from "./memory-job-queue.js";
export {
  createMemoryJobRunner,
  type MemoryFailedJob,
  type MemoryJobRunner,
  type MemorySchedule,
} from "./memory-job-runner.js";
export {
  createPgBossJobs,
  type FailedJob,
  type JobAdministration,
  type PgBossJobs,
  type PgBossJobsSettings,
} from "./pg-boss-jobs.js";
export { defaultRetryPolicy, type RetryPolicy } from "./retry-policy.js";
export {
  maskPersonalData,
  OWN_MESSAGE_KEY,
  ownMessage,
  ownMessages,
  sanitizeJobError,
  toError,
} from "./sanitize-job-error.js";
