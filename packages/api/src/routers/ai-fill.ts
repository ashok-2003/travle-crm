// ai.fill.*: "Fill it for me" (release ai2a). The AI proposes values for a form from words, a recording, a screenshot or a chat;
// it saves nothing, so these are mutations only because each takes one of the agency's monthly calls. The member needs
// ai:suggest and the right to use the form being filled (a new lead, a lead's edit and call note, a quote), checked per
// procedure so the plan's module for the form is checked too. A chat as the source needs inbox:view and is read in the
// member's own scope. A recording or screenshot goes from the browser straight to storage (requestInput, confirmInput).
import {
  aiFillInput,
  aiFillProposal,
  aiInputSlot,
  confirmAiInputInput,
  requestAiInputInput,
  type AiFillInput,
  type FillTarget,
} from "@travel-crm/contracts/ai";
import { confirmAiInput, fillForm, requestAiInput } from "@travel-crm/domain/ai";
import type { MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import type { Context } from "../context.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

type FillContext = Pick<Context, "db" | "files" | "ai"> & { member: MemberAccess };

async function fill(ctx: FillContext, input: AiFillInput, targets: readonly FillTarget[]) {
  if (!targets.includes(input.target))
    throw new DomainError("VALIDATION", "VALIDATION", "This form can't be filled that way");
  if (input.source.kind === "chat" && !ctx.member.permissions.has("inbox:view")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires inbox:view");
  }
  if (!ctx.ai?.configured) throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
  return fillForm({ db: ctx.db, model: ctx.ai, files: ctx.files }, ctx.member, input, new Date());
}

export const aiFillRouter = router({
  /** A new lead (quick-add), or one made from a chat. */
  lead: orgProcedure
    .requires("ai:suggest", "leads:create")
    .input(aiFillInput)
    .output(aiFillProposal)
    .mutation(({ ctx, input }) => fill(ctx, input, ["lead"])),

  /** A lead's trip, or the call note written up after a call (the call's own lead changes). */
  leadEdit: orgProcedure
    .requires("ai:suggest", "leads:edit")
    .input(aiFillInput)
    .output(aiFillProposal)
    .mutation(({ ctx, input }) => fill(ctx, input, ["lead_edit", "call_note"])),

  /** A quote's text; its prices are never proposed. */
  quote: orgProcedure
    .requires("ai:suggest", "quotes:edit")
    .input(aiFillInput)
    .output(aiFillProposal)
    .mutation(({ ctx, input }) => fill(ctx, input, ["quote"])),

  /** Step one of a recording or screenshot: where the browser puts it. Any member who may use the AI to fill. */
  requestInput: orgProcedure
    .requires("ai:suggest")
    .input(requestAiInputInput)
    .output(aiInputSlot)
    .mutation(({ ctx, input }) => requestAiInput(ctx, ctx.member, input)),

  /** Step two: the file arrived as promised. */
  confirmInput: orgProcedure
    .requires("ai:suggest")
    .input(confirmAiInputInput)
    .mutation(({ ctx, input }) => confirmAiInput(ctx, ctx.member, input)),
});
