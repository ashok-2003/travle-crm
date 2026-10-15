// The platform console's procedures (spec 7), served by the console process at /api/platform/trpc. The web app's
// console screens import the PlatformRouter type only.
import { listPlatformLogInput, platformLogPage, platformWhoAmIOutput } from "@travel-crm/contracts/platform";
import { listPlatformLog } from "@travel-crm/domain/platform";
import { staffProcedure } from "./procedures.js";
import { dataProtectionRouter } from "./routers/data-protection.js";
import { dashboardRouter, jobsRouter } from "./routers/operations.js";
import { organizationsRouter } from "./routers/organizations.js";
import { plansRouter } from "./routers/plans.js";
import { subscriptionsRouter } from "./routers/subscriptions.js";
import { platformT } from "./trpc.js";

export const platformRouter = platformT.router({
  /** Who is signed in, at which level; the console calls it when it opens. */
  whoAmI: staffProcedure
    .output(platformWhoAmIOutput)
    .query(({ ctx }) => ({ userId: ctx.staff.userId, name: ctx.staff.name, level: ctx.staff.level })),
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
  dataProtection: dataProtectionRouter,
  plans: plansRouter,
  subscriptions: subscriptionsRouter,
  jobs: jobsRouter,
  log: platformT.router({
    /** What platform staff and the platform's jobs did, newest first. */
    list: staffProcedure
      .input(listPlatformLogInput)
      .output(platformLogPage)
      .query(({ ctx, input }) => ctx.services.platformDb.transaction((tx) => listPlatformLog(tx, input))),
  }),
});

export type PlatformRouter = typeof platformRouter;
