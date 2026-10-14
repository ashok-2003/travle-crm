// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code.
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { platformRouter } from "./platform.js";
import { settingsRouter } from "./settings.js";

export const appRouter = router({
  me: meRouter,
  settings: settingsRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
