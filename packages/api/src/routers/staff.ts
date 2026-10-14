// Staff management (spec 6.3). Every procedure needs staff:manage and reads the session from the database, so an
// admin whose sessions were revoked is stopped at once (spec 6.4). The identity module enforces who may change whom.
import {
  createStaffInput,
  removeStaffInput,
  resetStaffPasswordInput,
  staffMember,
  updateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { z } from "zod";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const staffManager = freshProcedure.requires("staff:manage");

export const staffRouter = router({
  list: staffManager.output(z.array(staffMember)).query(({ ctx }) => ctx.identity.staff.list(ctx.member)),

  create: staffManager
    .input(createStaffInput)
    .output(staffMember)
    .mutation(({ ctx, input }) => ctx.identity.staff.create(ctx.member, input)),

  updateRole: staffManager
    .input(updateStaffRoleInput)
    .output(staffMember)
    .mutation(({ ctx, input }) => ctx.identity.staff.updateRole(ctx.member, input)),

  /** Sets a temporary password, signs the person out everywhere, and makes them choose a new one at sign-in. */
  resetPassword: staffManager.input(resetStaffPasswordInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.staff.resetPassword(ctx.member, input);
  }),

  /** Removes the person: their sessions end and their email and username are released (ADR 0007). */
  remove: staffManager.input(removeStaffInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.staff.remove(ctx.member, input);
  }),
});
