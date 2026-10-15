// The console's running of the platform: the dashboard of organizations (spec 7.4) and the failed-jobs list (spec 9.1).
import {
  failedJob,
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
  failed: staffProcedure
    .input(listFailedJobsInput)
    .output(z.array(failedJob))
    .query(({ ctx, input }) => listFailedJobs(ctx.services, input.limit)),
  retry: staffProcedure
    .input(retryFailedJobInput)
    .mutation(({ ctx, input }) => retryFailedJob(ctx.services, ctx.staff, input)),
  schedules: staffProcedure.output(z.array(jobSchedule)).query(({ ctx }) => listSchedules(ctx.services)),
  /** Removes a schedule a job left behind when it went from the code. */
  unschedule: superAdminProcedure
    .input(unscheduleInput)
    .mutation(({ ctx, input }) => removeSchedule(ctx.services, ctx.staff, input.queue)),
});
