// calls.*: the call panel and writing a call up (release 5, spec 3.4). Seeing a lead's number, sending it to the
// person's own phone and the page that push opens need leads:view (a lead out of scope is "not found", R26); writing a
// call up, changing it and deleting it need leads:edit (a call can be changed by its writer in the first day, then by a
// manager). "Send to my phone" tells the person only, changes no record, so it works in every state of the subscription.
import {
  callIdInput,
  callLogged,
  callTarget,
  editCallInput,
  logCallInput,
  sendToMyPhoneInput,
} from "@travel-crm/contracts/crm";
import { callTargetOf, deleteCall, editCall, limitDials, logCall, sendCallToMyPhone } from "@travel-crm/domain/crm";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("leads:view");
const editor = orgProcedure.requires("leads:edit");

export const callsRouter = router({
  /** The name and number of a lead, for the page "Send to my phone" opens. */
  target: viewer
    .input(sendToMyPhoneInput)
    .output(callTarget)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => callTargetOf(tx, ctx.member, input.leadId)),
    ),

  /** Pushes "Call {name}" to the person's own phone. */
  sendToMyPhone: viewer
    .meta({ lifecycle: "always" })
    .input(sendToMyPhoneInput)
    .mutation(async ({ ctx, input }) => {
      // The limiter has a transaction of its own: counted before the organization's.
      await limitDials(ctx.rateLimiter, ctx.member, new Date());
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => sendCallToMyPhone(tx, ctx.member, input.leadId));
    }),

  /** Writes a call up on the lead, with the next follow-up if one is asked for. */
  log: editor
    .input(logCallInput)
    .output(callLogged)
    .mutation(async ({ ctx, input }) => ({
      callId: await ctx.db.forOrg(ctx.member.organizationId, (tx) => logCall(tx, ctx.member, input, new Date())),
    })),

  edit: editor.input(editCallInput).mutation(async ({ ctx, input }) => {
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => editCall(tx, ctx.member, input, new Date()));
  }),

  remove: editor.input(callIdInput).mutation(async ({ ctx, input }) => {
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteCall(tx, ctx.member, input.callId, new Date()));
  }),
});
