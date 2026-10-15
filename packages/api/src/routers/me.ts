// me.get: who is signed in, their organization and permissions, and any step they must take first. Open to every
// signed-in person, including those who must change their password or set up two-factor, so the app can guide them.
import { TRPCError } from "@trpc/server";
import { meOutput } from "@travel-crm/contracts/identity";
import { protectedProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const meRouter = router({
  get: protectedProcedure
    .meta({ planModule: "core" })
    .output(meOutput)
    .query(async ({ ctx }) => {
      const me = await ctx.identity.describeSignedInPerson({
        userId: ctx.user.id,
        organizationId: ctx.session.activeOrganizationId ?? null,
        impersonatedBy: ctx.session.impersonatedBy ?? null,
      });
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
      return me;
    }),
});
