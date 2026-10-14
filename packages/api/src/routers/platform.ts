// The platform console's procedures (spec 7). Plan 4 adds organizations, plans and impersonation here.
import { z } from "zod";
import { platformProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const platformRouter = router({
  /** Confirms the caller is platform staff; the console calls it when it opens. */
  whoAmI: platformProcedure
    .output(z.object({ userId: z.uuid(), name: z.string() }))
    .query(({ ctx }) => ({ userId: ctx.user.id, name: ctx.user.name })),
});
