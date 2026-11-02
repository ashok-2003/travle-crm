// ai.rates.*: AI part 4b (release ai3b), reading a supplier's rate sheet. The AI proposes rate rows from a PDF, an Excel file or
// photos; it saves nothing: the save is suppliers.saveRateBatch, a person's checked rows through the supplier's own rate writes.
// Reading needs ai:suggest and suppliers:edit (and so the plan's ai and suppliers modules); it shows what the supplier is paid, so the
// session is read afresh. The file goes from the browser straight to storage (requestInput, confirmInput).
import {
  confirmAiInputInput,
  rateSheetProposal,
  rateSheetSlot,
  rateSheetSourceInput,
  rateSheetSourceLink as rateSheetSourceLinkOutput,
  readRateSheetInput,
  requestRateSheetInput,
} from "@travel-crm/contracts/ai";
import { confirmAiInput, rateSheetSourceLink, readRateSheet, requestRateSheetUpload } from "@travel-crm/domain/ai";
import { DomainError } from "@travel-crm/domain/kernel";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = freshProcedure.requires("ai:suggest", "suppliers:view", "suppliers:edit");
const uploader = orgProcedure.requires("ai:suggest", "suppliers:view", "suppliers:edit");

export const aiRatesRouter = router({
  /** The rows of a rate sheet: one part of it, one AI call. A big sheet answers with its parts and no rows, using no call. */
  read: reader
    .input(readRateSheetInput)
    .output(rateSheetProposal)
    .mutation(({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      if (!ctx.spreadsheets)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "Excel files can't be read on this server yet");
      return readRateSheet(
        { db: ctx.db, model: ctx.ai, files: ctx.files, spreadsheets: ctx.spreadsheets },
        ctx.member,
        input,
        new Date(),
      );
    }),

  /** Step one of the file: where the browser puts it. */
  requestInput: uploader
    .input(requestRateSheetInput)
    .output(rateSheetSlot)
    .mutation(({ ctx, input }) => requestRateSheetUpload(ctx, ctx.member, input)),

  /** Step two: the file arrived as promised. */
  confirmInput: uploader
    .input(confirmAiInputInput)
    .mutation(({ ctx, input }) => confirmAiInput(ctx, ctx.member, input)),

  /** A link to open the sheet that was read, beside its rows. */
  sourceLink: uploader
    .input(rateSheetSourceInput)
    .output(rateSheetSourceLinkOutput)
    .mutation(({ ctx, input }) => rateSheetSourceLink(ctx, ctx.member, input)),
});
