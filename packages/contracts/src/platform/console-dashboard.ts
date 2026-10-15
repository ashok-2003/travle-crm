// The platform dashboard (spec 7.4) and the failed-jobs list (spec 9.1), as the console shows them.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { subscriptionStatus } from "../subscriptions/index.js";

/** One organization on the dashboard: status, days left, seats used, last activity, this month's usage. */
export const organizationOverview = z.object({
  organizationId: recordId,
  name: z.string(),
  code: z.string(),
  /** Null for an organization without a subscription. */
  status: subscriptionStatus.nullable(),
  planName: z.string().nullable(),
  nextChangeOn: calendarDate.nullable(),
  /** Days until the status moves on if nothing is paid; null when it won't. */
  daysLeft: z.int().nullable(),
  seats: z.object({ used: z.int(), limit: z.int().nullable() }),
  storage: z.object({ usedBytes: z.int(), limitBytes: z.int().nullable() }),
  lastActiveAt: z.iso.datetime().nullable(),
  /** Since the first of the month, in the organization's time zone. */
  thisMonth: z.object({ changes: z.int(), documentsIssued: z.int() }),
});
export type OrganizationOverview = z.infer<typeof organizationOverview>;

/** A queue's name, "<module>.<what it does>", e.g. "documents.render-pdf", as the jobs port checks it. */
export const queueName = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'Queue names look like "documents.render-pdf"');

export const failedJob = z.object({
  id: recordId,
  queue: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /** Every attempt, the first one included. */
  attempts: z.int(),
  /** To the millisecond; null when the queue recorded no time. */
  failedAt: z.iso.datetime().nullable(),
  /** Already cut down and masked before it was stored (ADR 0010). */
  error: z.string(),
});
export type FailedJobOutput = z.infer<typeof failedJob>;

/** Where a page of the failed-jobs list starts: after this job, the last of the page before (its nextCursor). */
export const failedJobsCursor = z.strictObject({ failedAt: z.iso.datetime().nullable(), id: recordId });
export type FailedJobsCursor = z.infer<typeof failedJobsCursor>;

/** Failed jobs, newest first, a page at a time; optionally one queue's. */
export const listFailedJobsInput = z.strictObject({
  limit: z.int().min(1).max(200).default(50),
  after: failedJobsCursor.optional(),
  queue: queueName.optional(),
});
export type ListFailedJobsInput = z.infer<typeof listFailedJobsInput>;

export const failedJobsPage = z.object({
  jobs: z.array(failedJob),
  /** Pass as `after` for the next page; null on the last page. */
  nextCursor: failedJobsCursor.nullable(),
});
export type FailedJobsPage = z.infer<typeof failedJobsPage>;

export const retryFailedJobInput = z.strictObject({ queue: queueName, jobId: recordId });
export type RetryFailedJobInput = z.infer<typeof retryFailedJobInput>;

export const jobSchedule = z.object({ queue: z.string(), cron: z.string(), timeZone: z.string() });
export const unscheduleInput = z.strictObject({ queue: queueName });
