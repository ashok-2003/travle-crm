// The console's running of the platform: the dashboard of organizations (spec 7.4) and the failed-jobs list (spec 9.1).
import {
  failedJobsPage,
  jobSchedule,
  listFailedJobsInput,
  organizationOverview,
  retryFailedJobInput,
  unscheduleInput,
} from "@travel-crm/contracts/platform";
import {
  listFailedJobs,
  listSchedules,
  organizationsOverview,
  removeSchedule,
  retryFailedJob,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dashboardRouter = platformT.router({
  /** Every organization: status, days left, seats used, last activity, this month's usage. */
  organizations: staffProcedure
    .output(z.array(organizationOverview))
    .query(({ ctx }) => organizationsOverview(ctx.services)),
});

export const jobsRouter = platformT.router({
  /** Failed jobs, newest first, a page at a time; optionally one queue's. */
  failed: staffProcedure
    .input(listFailedJobsInput)
    .output(failedJobsPage)
    .query(({ ctx, input }) => listFailedJobs(ctx.services, input)),
  /** One more attempt of a failed job; not for the platform's purge, erasure or export, which are asked for again. */
  retry: staffProcedure
    .input(retryFailedJobInput)
    .mutation(({ ctx, input }) => retryFailedJob(ctx.services, ctx.staff, input)),
  schedules: staffProcedure.output(z.array(jobSchedule)).query(({ ctx }) => listSchedules(ctx.services)),
  /** Removes a schedule a job left behind when it went from the code. */
  unschedule: superAdminProcedure
    .input(unscheduleInput)
    .mutation(({ ctx, input }) => removeSchedule(ctx.services, ctx.staff, input.queue)),
});
