// assignment.*: how new leads find their owner (release C, spec 3.2). Reading and saving the settings need
// settings:manage; anyone who works leads marks themselves away from the pool and back. The lead workers come from
// identity before the change's transaction (never one forOrg inside another).
import { assignmentSettings, poolPlace, saveAssignmentInput, setAwayInput } from "@travel-crm/contracts/crm";
import { poolPlaceOf, readAssignment, saveAssignment, setAway } from "@travel-crm/domain/crm";
import { leadWorkerIds } from "../lead-workers.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = orgProcedure.requires("settings:manage");

export const assignmentRouter = router({
  get: manager
    .output(assignmentSettings)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => readAssignment(tx))),

  save: manager.input(saveAssignmentInput).mutation(async ({ ctx, input }) => {
    const workers = await leadWorkerIds(ctx.identity, ctx.member.organizationId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAssignment(tx, ctx.member, input, workers));
  }),

  /** The signed-in person's own place in the pool, for their away switch. */
  mine: orgProcedure
    .requires("leads:view")
    .output(poolPlace)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => poolPlaceOf(tx, ctx.member))),

  setAway: orgProcedure
    .requires("leads:view")
    .input(setAwayInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => setAway(tx, ctx.member, input))),
});
