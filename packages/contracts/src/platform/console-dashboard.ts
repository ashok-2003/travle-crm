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

export const failedJob = z.object({
  id: recordId,
  queue: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  attempts: z.int(),
  failedAt: z.iso.datetime().nullable(),
  /** Already cut down and masked before it was stored (ADR 0010). */
  error: z.string(),
});
export type FailedJobOutput = z.infer<typeof failedJob>;

export const listFailedJobsInput = z.strictObject({ limit: z.int().min(1).max(500).default(50) });
export const retryFailedJobInput = z.strictObject({ queue: z.string().max(100), jobId: recordId });
export type RetryFailedJobInput = z.infer<typeof retryFailedJobInput>;

export const jobSchedule = z.object({ queue: z.string(), cron: z.string(), timeZone: z.string() });
export const unscheduleInput = z.strictObject({ queue: z.string().max(100) });
