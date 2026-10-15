// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code. The
// platform console's routers are served apart, by the console process (platform/platform-router.ts).
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { organizationRouter } from "./profile.js";
import { rolesRouter } from "./roles.js";
import { settingsRouter } from "./settings.js";
import { staffRouter } from "./staff.js";
import { subscriptionRouter } from "./subscription.js";

export const appRouter = router({
  me: meRouter,
  staff: staffRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  subscription: subscriptionRouter,
  organization: organizationRouter,
});

export type AppRouter = typeof appRouter;
