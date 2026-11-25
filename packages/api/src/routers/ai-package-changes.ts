// ai.packageChanges.*: the AI change assistant on a trip's page. Show the changes (propose) asks the AI and spends one of
// the agency's credits; Apply and Undo all change the trip in one transaction; latest says what the page shows after an
// apply. Each needs quotes:edit, and propose ai:suggest too; departure and AI-switch changes inside need their own rights,
// which the domain checks against the member's role and the plan's departures. A photo or PDF goes from the browser
// straight to storage first (requestInput, confirmInput), as the rate reader's do.
import {
  applyPackageChangesInput,
  applyPackageChangesOutput,
  confirmAiInputInput,
  latestPackageChangeRunInput,
  latestPackageChangeRunOutput,
  packageChangeProposal,
  proposePackageChangesInput,
  rateSheetSlot,
  requestPackageChangesUploadInput,
  undoPackageChangesInput,
  undoPackageChangesOutput,
} from "@travel-crm/contracts/ai";
import {
  applyPackageChanges,
  confirmAiInput,
  latestPackageChangeRun,
  proposePackageChanges,
  requestRateSheetUpload,
  undoPackageChanges,
  type ApplyContext,
} from "@travel-crm/domain/ai";
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import type { Entitlements } from "@travel-crm/domain/subscriptions";
import { agencyToday } from "../package-departures-gate.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const proposer = freshProcedure.requires("ai:suggest", "quotes:edit");
const changer = freshProcedure.requires("quotes:edit");
const reader = orgProcedure.requires("quotes:edit");
const uploader = orgProcedure.requires("ai:suggest", "quotes:edit");

/** Apply and Undo all run many of the trip's operations in one transaction: longer than one save's. */
const CHANGE_TIMEOUT_MS = 30_000;

interface ChangeCaller {
  identity: Pick<Identity, "organizationProfile" | "membersHolding">;
  member: MemberAccess;
  entitlements?: Entitlements | null;
}

const departuresOnPlan = (ctx: Pick<ChangeCaller, "entitlements">) =>
  ctx.entitlements?.modules.has("departures") === true;

/** Today in the agency's zone, the plan's departures, and who hears of a departure a schedule change left alone. */
async function changeContext(ctx: ChangeCaller): Promise<ApplyContext> {
  return {
    today: await agencyToday(ctx),
    now: new Date(),
    departuresOnPlan: departuresOnPlan(ctx),
    managerUserIds: await ctx.identity.membersHolding(ctx.member.organizationId, "departures:edit"),
  };
}

export const aiPackageChangesRouter = router({
  /** One AI call: the changes the agency's words and files call for, each grounded in its lines. Changes nothing. */
  propose: proposer
    .input(proposePackageChangesInput)
    .output(packageChangeProposal)
    .mutation(({ ctx, input }) => {
      if (!ctx.ai?.configured) {
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      }
      return proposePackageChanges(
        { db: ctx.db, model: ctx.ai, files: ctx.files, prompts: ctx.prompts, tracing: ctx.tracing },
        ctx.member,
        input,
        new Date(),
        { departuresOnPlan: departuresOnPlan(ctx) },
      );
    }),

  /** The ticked changes of the member's own run, all or none ("apply" is a name tRPC reserves). */
  applyChanges: changer
    .input(applyPackageChangesInput)
    .output(applyPackageChangesOutput)
    .mutation(async ({ ctx, input }) => {
      const context = await changeContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => applyPackageChanges(tx, ctx.member, input, context), {
        timeout: CHANGE_TIMEOUT_MS,
      });
    }),

  /** The trip's latest applied run put back, while the trip is as it left it. */
  undo: changer
    .input(undoPackageChangesInput)
    .output(undoPackageChangesOutput)
    .mutation(async ({ ctx, input }) => {
      const context = await changeContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => undoPackageChanges(tx, ctx.member, input, context), {
        timeout: CHANGE_TIMEOUT_MS,
      });
    }),

  /** The trip's latest applied run and whether Undo all is still offered; null when there is none to show. */
  latest: reader
    .input(latestPackageChangeRunInput)
    .output(latestPackageChangeRunOutput)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => latestPackageChangeRun(tx, input.packageId, new Date())),
    ),

  /** Step one of a photo or PDF: where the browser puts it. */
  requestInput: uploader
    .input(requestPackageChangesUploadInput)
    .output(rateSheetSlot)
    .mutation(({ ctx, input }) => requestRateSheetUpload(ctx, ctx.member, input)),

  /** Step two: the file arrived as promised. */
  confirmInput: uploader
    .input(confirmAiInputInput)
    .mutation(({ ctx, input }) => confirmAiInput(ctx, ctx.member, input)),
});
