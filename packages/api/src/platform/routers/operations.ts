// The console's running of the platform: the dashboard of organizations (spec 7.4) and the system's health (what broke,
// the owner, 2026-11-02), and the failed-jobs list (spec 9.1).
import {
  failedJobsPage,
  jobSchedule,
  listFailedJobsInput,
  listOrganizationsOverviewInput,
  organizationsOverviewPage,
  platformIncidents,
  retryFailedJobInput,
  unscheduleInput,
} from "@travel-crm/contracts/platform";
import {
  listFailedJobs,
  listPlatformIncidents,
  listSchedules,
  organizationsOverview,
  removeSchedule,
  retryFailedJob,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const dashboardRouter = platformT.router({
  /** Every organization, a page at a time: status, days left, seats used, last activity, this month's usage. */
  organizations: staffProcedure
    .input(listOrganizationsOverviewInput)
    .output(organizationsOverviewPage)
    .query(({ ctx, input }) => organizationsOverview(ctx.services, input)),
  /** What is broken now, and the last week's incidents that were resolved. */
  incidents: staffProcedure.output(platformIncidents).query(({ ctx }) => listPlatformIncidents(ctx.services)),
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
