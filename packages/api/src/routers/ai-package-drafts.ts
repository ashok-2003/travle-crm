// ai.packageDrafts.*: AI plan 2, a group package drafted from the agency's own documents. find and draft only propose (each is
// one of the month's AI calls, so the session is read afresh); create is the owner's "Save as package", which saves what a
// person chose, then makes the departures as packages.update does and copies the cited PDF as a brochure.
import {
  createdGroupPackage,
  createGroupPackageInput,
  draftPackageInput,
  findTripsInput,
  foundTrips as foundTripsOutput,
  packageDraft,
} from "@travel-crm/contracts/ai";
import { draftPackage, findTrips } from "@travel-crm/domain/ai";
import { generatePackageDepartures } from "@travel-crm/domain/departures";
import { calendarDateIn, DomainError } from "@travel-crm/domain/kernel";
import { attachDraftBrochure, createGroupPackage } from "@travel-crm/domain/quotes";
import { mayMakeDepartures } from "../package-departures-gate.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const proposer = freshProcedure.requires("ai:suggest", "quotes:edit");
const saver = orgProcedure.requires("quotes:edit");

const notReady = () => new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");

export const aiPackageDraftsRouter = router({
  /** The trips the agency's documents describe: one part of them, one AI call. Long sources answer with their parts and no call. */
  find: proposer
    .input(findTripsInput)
    .output(foundTripsOutput)
    .mutation(({ ctx, input }) => {
      if (!ctx.ai?.configured) throw notReady();
      return findTrips({ db: ctx.db, model: ctx.ai }, ctx.member, input, new Date());
    }),

  /** One trip drafted, every value with the lines it came from. Saves nothing. */
  draft: proposer
    .input(draftPackageInput)
    .output(packageDraft)
    .mutation(({ ctx, input }) => {
      if (!ctx.ai?.configured) throw notReady();
      return draftPackage({ db: ctx.db, model: ctx.ai }, ctx.member, input, new Date());
    }),

  /** "Save as package". The brochure's copy runs after the transaction; if it fails the package stays saved. */
  create: saver
    .input(createGroupPackageInput)
    .output(createdGroupPackage)
    .mutation(async ({ ctx, input }) => {
      const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
      const today = calendarDateIn(new Date(), timeZone);
      const { id } = await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const created = await createGroupPackage(tx, ctx.member, input);
        if (mayMakeDepartures(ctx)) await generatePackageDepartures(tx, ctx.member, created.id, today);
        return created;
      });
      if (input.brochureKnowledgeId === null) return { id, brochure: "none" as const };
      try {
        await attachDraftBrochure({ db: ctx.db, files: ctx.files }, ctx.member, id, input.brochureKnowledgeId);
        return { id, brochure: "attached" as const };
      } catch (error) {
        // Names and codes only: no stack, no message, nothing that could hold a person's words.
        const { name, code, reason } = error as { name?: string; code?: string; reason?: string };
        console.error("package brochure not attached", { name, code, reason });
        return { id, brochure: "failed" as const };
      }
    }),
});
