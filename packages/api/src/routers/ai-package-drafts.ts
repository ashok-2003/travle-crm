// ai.packageDrafts.*: find and draft propose a group package from the agency's documents (AI calls); create is the owner's save.
// New package from PDFs: each PDF is uploaded as one of those documents, and importPdf makes every trip in it a package.
import {
  aiDocumentSlot,
  confirmAiDocumentInput,
  createdGroupPackage,
  createGroupPackageInput,
  importedPdf,
  importPdfInput,
  pdfDocumentStates,
  pdfDocumentStatesInput,
  requestAiDocumentInput,
  draftPackageInput,
  findTripsInput,
  foundTrips as foundTripsOutput,
  packageDraft,
} from "@travel-crm/contracts/ai";
import {
  confirmDocument,
  draftPackage,
  findTrips,
  importPackagesFromPdf,
  pdfDocumentStatesOf,
  requestDocument,
} from "@travel-crm/domain/ai";
import { generatePackageDepartures } from "@travel-crm/domain/departures";
import { DomainError } from "@travel-crm/domain/kernel";
import { attachDraftBrochure, createGroupPackage } from "@travel-crm/domain/quotes";
import { agencyToday, mayMakeDepartures } from "../package-departures-gate.js";
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

  /** New package from a PDF, step one: where the browser puts the file (it is kept as one of the AI's documents). */
  requestPdf: proposer
    .input(requestAiDocumentInput)
    .output(aiDocumentSlot)
    .mutation(({ ctx, input }) => requestDocument(ctx, ctx.member, input)),

  /** Step two: the file is stored; the worker reads its words. */
  confirmPdf: proposer
    .input(confirmAiDocumentInput)
    .mutation(({ ctx, input }) => confirmDocument(ctx, ctx.member, input)),

  /** Whether the worker has read each uploaded PDF yet. */
  pdfStates: proposer
    .input(pdfDocumentStatesInput)
    .output(pdfDocumentStates)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => pdfDocumentStatesOf(tx, input.knowledgeIds)),
    ),

  /** Step three: every trip in the read PDF made a group package at once, each with what the AI still needs to sell it. */
  importPdf: proposer
    .input(importPdfInput)
    .output(importedPdf)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured) throw notReady();
      return importPackagesFromPdf({ db: ctx.db, model: ctx.ai, files: ctx.files }, ctx.member, input.knowledgeId, {
        now: new Date(),
        today: await agencyToday(ctx),
        makeDepartures: mayMakeDepartures(ctx),
      });
    }),

  /** "Save as package". The brochure's copy runs after the transaction; if it fails the package stays saved. */
  create: saver
    .input(createGroupPackageInput)
    .output(createdGroupPackage)
    .mutation(async ({ ctx, input }) => {
      const today = await agencyToday(ctx);
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
        const named = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
        console.error("package brochure not attached", { name: named.name, code: named.code, reason: named.reason });
        return { id, brochure: "failed" as const };
      }
    }),
});
