// The console's invite-only program (the owner, 2026-10-28): every platform staff member makes invites in bulk from a
// sheet's rows, sees how each link has done, and cancels one not yet used. The links are the web app's.
import { createVipInvitesInput, vipInviteIdInput, vipInviteList } from "@travel-crm/contracts/platform";
import { cancelVipInvite, createVipInvites, listVipInvites } from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const invitesRouter = platformT.router({
  list: staffProcedure
    .output(vipInviteList)
    .query(({ ctx }) => listVipInvites(ctx.services, ctx.services.appUrl ?? "")),
  create: staffProcedure
    .input(createVipInvitesInput)
    .output(z.object({ created: z.int() }))
    .mutation(({ ctx, input }) => createVipInvites(ctx.services, ctx.staff, input)),
  cancel: staffProcedure
    .input(vipInviteIdInput)
    .mutation(({ ctx, input }) => cancelVipInvite(ctx.services, ctx.staff, input.inviteId)),
});
