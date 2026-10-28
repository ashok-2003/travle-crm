// me.get: who is signed in, their organization and permissions, and any step they must take first. Open to every
// signed-in person, including those who must change their password or set up two-factor, so the app can guide them.
// And an invited Owner's own password (the invite program): whether they still have one to choose, and choosing it,
// in every subscription state.
import { TRPCError } from "@trpc/server";
import { meOutput, newPassword } from "@travel-crm/contracts/identity";
import { z } from "zod";
import { orgProcedure, protectedProcedure } from "../procedures.js";
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

  ownPassword: orgProcedure
    .meta({ planModule: "core", lifecycle: "always" })
    .output(z.object({ toChoose: z.boolean() }))
    .query(async ({ ctx }) => ({ toChoose: await ctx.identity.ownPassword.toChoose(ctx.member) })),

  chooseOwnPassword: orgProcedure
    .meta({ planModule: "core", lifecycle: "always" })
    .input(z.strictObject({ password: newPassword }))
    .output(z.object({ chosen: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.identity.ownPassword.choose(ctx.member, input.password)),
});
